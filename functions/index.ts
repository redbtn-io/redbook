import { createServer, IncomingMessage, ServerResponse } from 'http';
import { parse } from 'url';
import { StringDecoder } from 'string_decoder';
import * as nodemailer from 'nodemailer';

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
        html: `<p>Hi ${name} it's George with NILICO. Blah blah blah your union ${source} is offering you a benefit.</p> \n <img src=${img} />`,
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

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
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
                const parsedBody = JSON.parse(body);
                const { email, name, source, img } = parsedBody;

                // Validate required fields
                if (!email || !name || !source || !img) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required fields: email, name, source, or img' }));
                    return;
                }

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

server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});