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

    // Handle different content types
    let formData = {};
    const contentType = event.headers['content-type'] || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      console.log('Processing URL-encoded data');
      const bodyData = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64').toString() : 
        event.body;
      
      const parsed = querystring.parse(bodyData);
      
      // Convert querystring format to our format
      Object.keys(parsed).forEach(key => {
        const value = parsed[key];
        if (Array.isArray(value)) {
          formData[key] = value.join(', ');
        } else {
          formData[key] = value;
        }
      });
      
    } else if (contentType.includes('multipart/form-data')) {
      // For multipart data, we'll extract fields manually (simplified approach)
      console.log('Processing multipart data (simplified)');
      const bodyData = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64').toString() : 
        event.body;
      
      // Simple field extraction for multipart (won't handle files, but will handle form fields)
      const fields = bodyData.split('Content-Disposition: form-data; name=');
      
      fields.forEach(field => {
        if (field.includes('"') && field.includes('\r\n\r\n')) {
          const nameMatch = field.match(/"([^"]+)"/);
          const valueMatch = field.split('\r\n\r\n')[1];
          
          if (nameMatch && valueMatch) {
            const name = nameMatch[1];
            const value = valueMatch.split('\r\n')[0].trim();
            
            if (name && value) {
              if (formData[name]) {
                formData[name] = Array.isArray(formData[name]) ? 
                  [...formData[name], value] : [formData[name], value];
              } else {
                formData[name] = value;
              }
            }
          }
        }
      });
      
      // Convert arrays to comma-separated strings
      Object.keys(formData).forEach(key => {
        if (Array.isArray(formData[key])) {
          formData[key] = formData[key].join(', ');
        }
      });
    }

    console.log('Form data processed, keys:', Object.keys(formData));

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
      'signature': 'Signature',
      'date': 'Date Signed',
      'comments': 'Comments',
      'sp_full_name': 'Full Name (Sole Proprietor)',
      'sp_mobile': 'Mobile (Sole Proprietor)',
      'sp_email': 'Email (Sole Proprietor)',
      'c_company_name': 'Company Name',
      'action': 'Actions Required',
      'document_type': 'Required Documents'
    };

    // Build email content
    let tableRows = '';
    Object.entries(cleanData).forEach(([key, value]) => {
      const displayName = fieldNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const displayValue = value.length > 150 ? value.substring(0, 150) + '...' : value;
      
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
            .header { background-color: #667eea; color: white; padding: 15px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Galvins - New Instruction Sheet</h1>
            <p>Submitted: ${new Date().toLocaleString('en-AU')}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Field</th>
                <th style="border: 1px solid #ddd; padding: 8px; background-color: #f2f2f2;">Value</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <p style="margin-top: 20px; font-style: italic; color: #666;">
            Note: File attachments are not supported in this simplified version.
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
      subject: `New Instruction Sheet - ${cleanData['signature'] || 'Unknown'}`,
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
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #667eea; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; text-align: center; }
              .success-icon { font-size: 4em; color: #28a745; margin-bottom: 20px; }
              .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✓</div>
              <h1>Submission Successful!</h1>
              <p>Your instruction sheet has been submitted and sent to <strong>${recipient}</strong>.</p>
              <p><em>Note: File attachments are not included in this version.</em></p>
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
              body { font-family: Arial, sans-serif; margin: 0; padding: 40px; background: #667eea; }
              .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; text-align: center; }
              .error-icon { font-size: 4em; color: #dc3545; margin-bottom: 20px; }
              .btn { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">⚠</div>
              <h1>Submission Error</h1>
              <p>Error: ${error.message}</p>
              <p>Please try again or contact support.</p>
              <a href="/" class="btn">Go Back to Form</a>
            </div>
          </body>
        </html>
      `
    };
  }
};