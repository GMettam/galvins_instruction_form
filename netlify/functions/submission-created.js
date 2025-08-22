const sgMail = require('@sendgrid/mail');
const querystring = require('querystring');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_SENDER_EMAIL) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body><h1>Configuration Error</h1><p><a href="/">Go back</a></p></body></html>`
    };
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    if (!event.body) {
      throw new Error('No form data received');
    }

    // Parse form data (same as debug function)
    const bodyData = event.isBase64Encoded ? 
      Buffer.from(event.body, 'base64').toString() : 
      event.body;
    
    const parsed = querystring.parse(bodyData);

    // Simple field extraction
    const formData = {};
    Object.keys(parsed).forEach(key => {
      if (key === 'bot-field') return; // Skip honeypot
      
      const value = parsed[key];
      if (value) {
        formData[key] = Array.isArray(value) ? value.join(', ') : value.toString();
      }
    });

    // Check honeypot
    if (formData['bot-field'] && formData['bot-field'].trim() !== '') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<html><body><h1>Spam Detected</h1><p><a href="/">Go back</a></p></body></html>`
      };
    }

    // Build simple email content
    let emailContent = 'GALVINS - NEW INSTRUCTION SHEET SUBMISSION\n\n';
    emailContent += `Submitted: ${new Date().toLocaleString('en-AU')}\n\n`;
    emailContent += 'FORM DETAILS:\n';
    emailContent += '=' * 50 + '\n\n';

    // Add key fields first
    const keyFields = ['amount', 'signature', 'debtor_type', 'send_to', 'send_to_other'];
    keyFields.forEach(key => {
      if (formData[key]) {
        const displayName = key.replace(/_/g, ' ').toUpperCase();
        emailContent += `${displayName}: ${formData[key]}\n`;
      }
    });

    emailContent += '\nALL FIELDS:\n';
    emailContent += '-' * 30 + '\n';

    // Add all other fields
    Object.keys(formData).forEach(key => {
      if (!keyFields.includes(key)) {
        const displayName = key.replace(/_/g, ' ').toUpperCase();
        const value = formData[key].length > 100 ? formData[key].substring(0, 100) + '...' : formData[key];
        emailContent += `${displayName}: ${value}\n`;
      }
    });

    // Determine recipient
    let recipient = formData['send_to'] || 'greg@mettams.com.au';
    if (recipient === 'other' && formData['send_to_other']) {
      recipient = formData['send_to_other'];
    }

    // Send email
    await sgMail.send({
      to: recipient,
      from: {
        email: process.env.SENDGRID_SENDER_EMAIL,
        name: 'Galvins Instruction Form'
      },
      subject: `New Instruction Sheet - ${formData['signature'] || 'Unknown'}`,
      text: emailContent
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Submission Successful</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #667eea; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; text-align: center; }
              .success { font-size: 4em; color: #28a745; margin-bottom: 20px; }
              .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✓</div>
              <h1>Submission Successful!</h1>
              <p>Your instruction sheet has been submitted and sent to <strong>${recipient}</strong>.</p>
              <a href="/" class="btn">Submit Another Form</a>
            </div>
          </body>
        </html>
      `
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Submission Error</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #dc3545; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; text-align: center; }
              .error { font-size: 4em; color: #dc3545; margin-bottom: 20px; }
              .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error">⚠</div>
              <h1>Submission Error</h1>
              <p>Error: ${error.message}</p>
              <a href="/" class="btn">Go Back to Form</a>
            </div>
          </body>
        </html>
      `
    };
  }
};