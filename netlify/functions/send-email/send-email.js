const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  try {
    const { to, formData } = JSON.parse(event.body);

    const transporter = nodemailer.createTransport({
      host: 'smtp.netlify.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.NETLIFY_EMAIL_USER,
        pass: process.env.NETLIFY_EMAIL_PASSWORD
      }
    });

    await transporter.sendMail({
      from: process.env.NETLIFY_EMAIL_USER,
      to,
      subject: 'New Form Submission',
      text: `Form data:\n${JSON.stringify(formData, null, 2)}`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to send email' })
    };
  }
};
