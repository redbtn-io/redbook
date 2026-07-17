import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { StringDecoder } from 'string_decoder';
import * as nodemailer from 'nodemailer';
import { buildEmailHtml, validateSendPayload } from './email';

const port = 3000;

const sendEmail = async (to: string, name: string, source: string, img: string): Promise<void> => {
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: "Your secret code",
        html: buildEmailHtml({ name, source, img }),
    };

    return await new Promise<void>((resolve, reject) => {
        transporter.sendMail(mailOptions, (error: any, info: any) => {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                console.log("Email sent: " + info.response);
                resolve();
            }
        });
    });
};

export type ParsedBody =
    | { ok: true; value: unknown }
    | { ok: false; error: string };

export const parseRequestBody = (body: string): ParsedBody => {
    try {
        return { ok: true, value: JSON.parse(body) };
    } catch {
        return { ok: false, error: 'Invalid JSON payload' };
    }
};

export const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parse(req.url || '', true);
    const method = req.method || '';
    const decoder = new StringDecoder('utf-8');
    let body = '';

    req.on('data', (chunk) => {
        body += decoder.write(chunk);
    });

    req.on('end', async () => {
        decoder.end();

        if (parsedUrl.pathname === '/send' && method.toUpperCase() === 'POST') {
            try {
                const parsedBodyResult = parseRequestBody(body);
                if (parsedBodyResult.ok === false) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: parsedBodyResult.error }));
                    return;
                }

                // Validate + sanitize untrusted input at the trust boundary.
                const validation = validateSendPayload(parsedBodyResult.value);
                if (validation.ok === false) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: validation.error }));
                    return;
                }

                const { email, name, source, img } = validation.value;

                // Send the email
                await sendEmail(email, name, source, img);

                // Respond to the client
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ message: 'Email details logged successfully' }));
            } catch (error) {
                console.error(error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal Server Error' }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        }
    });
});

if (process.env.NODE_ENV !== 'test') {
    server.listen(port, () => {
        console.log(`Server is running on http://localhost:${port}`);
    });
}
