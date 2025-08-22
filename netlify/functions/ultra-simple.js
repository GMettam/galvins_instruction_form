// Create this as netlify/functions/ultra-simple.js

exports.handler = async (event) => {
  try {
    // Just send the raw form data without parsing
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    await sgMail.send({
      to: 'greg@mettams.com.au',
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: 'Raw Form Data Test',
      text: `Raw form submission data:\n\nMethod: ${event.httpMethod}\nContent-Type: ${event.headers['content-type']}\nBody: ${event.body}\n\nTime: ${new Date().toISOString()}`
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Ultra Simple Test Works!</h1>
            <p>Raw form data sent via email.</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Error</h1>
            <p>Error: ${error.message}</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
  }
};