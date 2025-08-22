// Create this as netlify/functions/minimal-working.js

exports.handler = async (event) => {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Exact same parsing as debug function
    const bodyData = event.isBase64Encoded ? 
      Buffer.from(event.body, 'base64').toString() : 
      event.body;
    
    const querystring = require('querystring');
    const parsed = querystring.parse(bodyData);
    
    // Build email content
    let emailContent = 'GALVINS INSTRUCTION SHEET\n\n';
    emailContent += `Submitted: ${new Date().toLocaleString()}\n\n`;
    
    // Add key fields
    if (parsed.amount) emailContent += `Amount: ${parsed.amount}\n`;
    if (parsed.signature) emailContent += `Signature: ${parsed.signature}\n`;
    if (parsed.debtor_type) emailContent += `Debtor Type: ${parsed.debtor_type}\n`;
    
    emailContent += '\nAll Fields:\n';
    Object.keys(parsed).forEach(key => {
      if (key !== 'bot-field' && parsed[key]) {
        emailContent += `${key}: ${parsed[key]}\n`;
      }
    });
    
    // Determine recipient
    let recipient = parsed.send_to_other || parsed.send_to || 'greg@mettams.com.au';
    if (recipient === 'other') recipient = 'greg@mettams.com.au';
    
    await sgMail.send({
      to: recipient,
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: `Instruction Sheet - ${parsed.signature || 'Unknown'}`,
      text: emailContent
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Success!</h1>
            <p>Form submitted to ${recipient}</p>
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
            <p>${error.message}</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
  }
};