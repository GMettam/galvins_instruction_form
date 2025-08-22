// Create this as netlify/functions/debug-parsing.js

exports.handler = async (event) => {
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    let debugInfo = 'Debug Parsing Test:\n\n';
    
    // Step 1: Check if body exists
    debugInfo += `Step 1 - Body exists: ${!!event.body}\n`;
    if (!event.body) {
      throw new Error('No body received');
    }
    
    // Step 2: Decode body if needed
    debugInfo += `Step 2 - Is Base64: ${event.isBase64Encoded}\n`;
    const bodyData = event.isBase64Encoded ? 
      Buffer.from(event.body, 'base64').toString() : 
      event.body;
    debugInfo += `Step 3 - Body length: ${bodyData.length}\n`;
    
    // Step 3: Try querystring parsing
    debugInfo += `Step 4 - Attempting querystring parse...\n`;
    const querystring = require('querystring');
    const parsed = querystring.parse(bodyData);
    debugInfo += `Step 5 - Parse successful. Keys: ${Object.keys(parsed).length}\n`;
    
    // Step 4: Extract a few sample fields
    debugInfo += `Step 6 - Sample fields:\n`;
    debugInfo += `- amount: ${parsed.amount || 'not found'}\n`;
    debugInfo += `- signature: ${parsed.signature || 'not found'}\n`;
    debugInfo += `- send_to: ${parsed.send_to || 'not found'}\n`;
    debugInfo += `- send_to_other: ${parsed.send_to_other || 'not found'}\n`;
    
    // Step 5: Try to send email
    debugInfo += `Step 7 - Attempting to send email...\n`;
    
    await sgMail.send({
      to: 'greg@mettams.com.au',
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: 'Debug Parsing Test Results',
      text: debugInfo
    });
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Debug Parsing Success!</h1>
            <p>All parsing steps completed successfully.</p>
            <p>Check your email for detailed debug info.</p>
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
            <h1>Debug Parsing Failed</h1>
            <p>Error at step: ${error.message}</p>
            <a href="/">Go back</a>
          </body>
        </html>
      `
    };
  }
};