import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY_ORIGIN = 'https://registry.redbtn.io';
export const REQUIRED_SHARED_PACKAGES = [
  '@redbtn/redlog',
  '@redbtn/redsecrets',
];
export const REQUIRED_SHARED_VERSIONS = Object.freeze({
  '@redbtn/redlog': '0.1.0',
  '@redbtn/redsecrets': '0.1.0',
});

const stableSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const sha512Integrity = /^sha512-[A-Za-z0-9+/]+={2}$/;

function isRegistryResolution(resolved, packageName, version) {
  try {
    const url = new URL(resolved);
    return (
      url.origin === REGISTRY_ORIGIN &&
      url.pathname === `/${packageName}/-/${packageName.split('/')[1]}-${version}.tgz`
    );
  } catch {
    return false;
  }
}

function validateLockfileDependencyClosure(lockfile, packagePath, lockedPackage, errors) {
  const dependencies = lockedPackage?.dependencies;
  if (!dependencies || typeof dependencies !== 'object') {
    return;
  }

  for (const dependencyName of Object.keys(dependencies)) {
    const nodeModulesDependency = `node_modules/${dependencyName}`;

    if (!lockfile.packages || !Object.prototype.hasOwnProperty.call(lockfile.packages, nodeModulesDependency)) {
      errors.push(
        `${packagePath} declares dependency ${dependencyName} but package-lock.json is missing ${nodeModulesDependency}.`,
      );
    }
  }
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

/**
 * Verifies this service’s shared dependency contract without install-time side effects.
 */
export async function verifySharedDependencies({ directory }) {
  const errors = [];
  let manifest;
  let lockfile;
  let npmrc;

  try {
    [manifest, lockfile, npmrc] = await Promise.all([
      readJson(path.join(directory, 'package.json')),
      readJson(path.join(directory, 'package-lock.json')),
      readFile(path.join(directory, '.npmrc'), 'utf8'),
    ]);
  } catch (error) {
    return {
      valid: false,
      errors: [`Unable to read contract files: ${error.message}`],
    };
  }

  const registryLines = npmrc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('@redbtn:registry='));

  if (
    registryLines.length !== 1 ||
    registryLines[0] !== '@redbtn:registry=https://registry.redbtn.io/'
  ) {
    errors.push(
      '.npmrc must include exactly one @redbtn registry mapping to https://registry.redbtn.io/.',
    );
  }

  for (const packageName of REQUIRED_SHARED_PACKAGES) {
    const declaredVersion = manifest.dependencies?.[packageName];
    const requiredVersion = REQUIRED_SHARED_VERSIONS[packageName];

    if (!stableSemver.test(declaredVersion ?? '')) {
      errors.push(`${packageName} must declare an exact stable semver version; found ${JSON.stringify(declaredVersion)}.`);
      continue;
    }

    if (declaredVersion !== requiredVersion) {
      errors.push(
        `${packageName}@${declaredVersion} is stale or unsupported; the required version is ${requiredVersion}.`,
      );
    }

    if (lockfile.packages?.['']?.dependencies?.[packageName] !== declaredVersion) {
      errors.push(`${packageName} declaration does not match package-lock root dependency.`);
    }

    const lockedEntries = Object.entries(lockfile.packages ?? {}).filter(([packagePath]) =>
      packagePath.endsWith(`node_modules/${packageName}`),
    );

    if (lockedEntries.length === 0) {
      errors.push(`${packageName} is missing from package-lock.json.`);
      continue;
    }

    for (const [packagePath, lockedPackage] of lockedEntries) {
      if (lockedPackage.version !== declaredVersion) {
        errors.push(`${packagePath} is stale: expected ${declaredVersion}, found ${lockedPackage.version ?? 'no version'}.`);
      }

      if (!isRegistryResolution(lockedPackage.resolved, packageName, declaredVersion)) {
        errors.push(`${packagePath} must resolve from ${REGISTRY_ORIGIN}; found ${lockedPackage.resolved ?? 'no resolved URL'}.`);
      }

      if (typeof lockedPackage.integrity !== 'string' || !sha512Integrity.test(lockedPackage.integrity)) {
        errors.push(`${packagePath} must use a sha512 integrity value from registry publication.`);
      }

      validateLockfileDependencyClosure(lockfile, packagePath, lockedPackage, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await verifySharedDependencies({ directory });

  if (!result.valid) {
    console.error('Shared dependency contract failed:');
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`Shared dependency contract passed for ${REQUIRED_SHARED_PACKAGES.join(', ')}.`);
  }
}
