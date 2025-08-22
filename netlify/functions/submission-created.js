const sgMail = require('@sendgrid/mail');
const querystring = require('querystring');

exports.handler = async (event) => {
  console.log('=== FUNCTION START ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Content-Type:', event.headers['content-type']);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_SENDER_EMAIL) {
    console.error('Missing environment variables');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `<html><body><h1>Configuration Error</h1><p><a href="/">Go back</a></p></body></html>`
    };
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    console.log('Processing form data...');
    
    if (!event.body) {
      throw new Error('No form data received');
    }

    // Parse URL-encoded data
    const bodyData = event.isBase64Encoded ? 
      Buffer.from(event.body, 'base64').toString() : 
      event.body;
    
    console.log('Body data received, length:', bodyData.length);
    
    const parsed = querystring.parse(bodyData);
    console.log('Parsed data keys:', Object.keys(parsed));

    // Convert parsed data to clean format
    const formData = {};
    Object.keys(parsed).forEach(key => {
      const value = parsed[key];
      if (Array.isArray(value)) {
        formData[key] = value.join(', ');
      } else if (value) {
        formData[key] = value.toString();
      }
    });

    // Check honeypot
    if (formData['bot-field'] && formData['bot-field'].trim() !== '') {
      console.log('Honeypot triggered');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `<html><body><h1>Spam Detected</h1><p><a href="/">Go back</a></p></body></html>`
      };
    }

    // Clean and filter data
    const cleanData = {};
    Object.keys(formData).forEach(key => {
      if (key === 'bot-field') return;
      
      const value = formData[key] ? formData[key].toString().trim() : '';
      if (value) {
        // Handle date formatting
        if (key === 'date' || key === 'debt_incurred_date') {
          const dateParts = value.split('-');
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts;
            cleanData[key] = `${day}/${month}/${year}`;
          } else {
            cleanData[key] = value;
          }
        } else {
          cleanData[key] = value.substring(0, 1000); // Limit length
        }
      }
    });

    console.log('Clean data prepared, keys:', Object.keys(cleanData));

    // Field name mapping
    const fieldNameMap = {
      'amount': 'Claim Amount',
      'claim_type': 'Claim Type',
      'debt_incurred_date': 'Debt Incurred Date',
      'account_no': 'Account Number',
      'debtor_type': 'Debtor Type',
      'send_to': 'Send To',
      'send_to_other': 'Send To (Other)',
      'signature': 'Signature',
      'date': 'Date Signed',
      'comments': 'Comments',
      'sp_full_name': 'Full Name (Sole Proprietor)',
      'sp_mobile': 'Mobile (Sole Proprietor)',
      'sp_email': 'Email (Sole Proprietor)',
      'sp_acn_abn': 'ACN/ABN (Sole Proprietor)',
      'sp_home_address': 'Home Address (Sole Proprietor)',
      'c_company_name': 'Company Name',
      'action': 'Actions Required',
      'document_type': 'Required Documents',
      'goods_sold_details': 'Goods Sold Details',
      'debt_incurred_details': 'Debt Incurred Details',
      'demand_letter_details': 'Demand Letter Details',
      'demand_letter_days': 'Demand Letter Days'
    };

    // Build email content table
    let tableRows = '';
    Object.entries(cleanData).forEach(([key, value]) => {
      const displayName = fieldNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
      
      tableRows += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold; background-color: #f9f9f9; width: 200px; vertical-align: top;">
            ${displayName}
          </td>
          <td style="border: 1px solid #ddd; padding: 8px; word-wrap: break-word;">
            ${displayValue.replace(/\n/g, '<br>')}
          </td>
        </tr>
      `;
    });

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            .header { background-color: #667eea; color: white; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
            th, td { text-align: left; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Galvins - New Instruction Sheet Submission</h1>
            <p>Submitted: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}</p>
          </div>
          
          <h2>Form Details</h2>
          <table>
            <thead>
              <tr>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Field</th>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          <p style="margin-top: 20px; font-style: italic; color: #666; font-size: 12px;">
            This form submission was processed automatically by the Galvins instruction form system.
          </p>
        </body>
      </html>
    `;

    // Determine recipient
    let recipient = cleanData['send_to'] || 'greg@mettams.com.au';
    if (recipient === 'other' && cleanData['send_to_other']) {
      recipient = cleanData['send_to_other'];
    }
    
    console.log('Sending email to:', recipient);

    // Send email
    const msg = {
      to: recipient,
      from: {
        email: process.env.SENDGRID_SENDER_EMAIL,
        name: 'Galvins Instruction Form'
      },
      subject: `New Instruction Sheet - ${cleanData['signature'] || 'Unknown Client'}`,
      html: htmlBody
    };

    console.log('Sending email via SendGrid...');
    const response = await sgMail.send(msg);
    console.log('Email sent successfully! Response:', response[0].statusCode);

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
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
              .success-icon { font-size: 4em; color: #28a745; margin-bottom: 20px; }
              .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; margin-top: 20px; transition: transform 0.2s; }
              .btn:hover { transform: translateY(-2px); }
              .recipient { background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✓</div>
              <h1>Instruction Sheet Submitted Successfully!</h1>
              <p>Your instruction sheet has been processed and sent via email.</p>
              <div class="recipient">
                <strong>Sent to:</strong> ${recipient}
              </div>
              <p>You should receive a confirmation or response shortly.</p>
              <a href="/" class="btn">Submit Another Form</a>
            </div>
          </body>
        </html>
      `
    };

  } catch (error) {
    console.error('=== ERROR DETAILS ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);

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
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #dc3545; min-height: 100vh; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 15px; text-align: center; }
              .error-icon { font-size: 4em; color: #dc3545; margin-bottom: 20px; }
              .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">⚠</div>
              <h1>Submission Error</h1>
              <p>There was an error processing your form submission.</p>
              <p><strong>Error:</strong> ${error.message}</p>
              <p>Please try again or contact support if the problem persists.</p>
              <a href="/" class="btn">Go Back to Form</a>
            </div>
          </body>
        </html>
      `
    };
  }
};