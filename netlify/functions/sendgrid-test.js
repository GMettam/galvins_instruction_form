// Create this as netlify/functions/sendgrid-test.js

exports.handler = async (event) => {
  console.log('SendGrid test function started');
  
  try {
    // Test if we can import SendGrid
    const sgMail = require('@sendgrid/mail');
    console.log('SendGrid imported successfully');
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('API key set');
    
    // Try to send a simple test email
    const msg = {
      to: process.env.SENDGRID_SENDER_EMAIL, // Send to yourself for testing
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: 'Netlify Function Test',
      text: 'This is a test email from your Netlify function'
    };
    
    await sgMail.send(msg);
    console.log('Email sent successfully');
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: green;">✓ SendGrid Test Successful!</h1>
            <p>Email sent successfully to ${process.env.SENDGRID_SENDER_EMAIL}</p>
            <p>Check your email inbox.</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
    
  } catch (error) {
    console.error('SendGrid test error:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: red;">SendGrid Test Failed</h1>
            <p>Error: ${error.message}</p>
            <p>Check the function logs for details.</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
  }
};