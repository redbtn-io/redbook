const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubmissionPayload {
  name: string;
  email: string;
  source: string;
  img: string;
}

export const isValidEmail = (email: string): boolean => EMAIL_REGEX.test(email);

export const buildSubmissionPayload = ({
  name,
  email,
  source,
  img,
}: SubmissionPayload): SubmissionPayload => ({
  name: name.trim(),
  email: email.trim(),
  source: source.trim(),
  img,
});
