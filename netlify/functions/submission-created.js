const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');
const { Readable } = require('stream');

exports.handler = async (event) => {
  console.log('=== FUNCTION START ===');
  console.log('HTTP Method:', event.httpMethod);
  console.log('Content-Type:', event.headers['content-type']);
  console.log('SendGrid API Key exists:', !!process.env.SENDGRID_API_KEY);
  console.log('Sender Email:', process.env.SENDGRID_SENDER_EMAIL);

  // Only handle POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Check environment variables
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_SENDER_EMAIL) {
    console.error('Missing environment variables');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html><body>
          <h1>Configuration Error</h1>
          <p>Email service not configured. Please contact administrator.</p>
          <p><a href="/">Go back to form</a></p>
        </body></html>
      `
    };
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    console.log('Starting form parsing...');
    
    if (!event.body) {
      throw new Error('No form data received');
    }

    // Handle the body properly
    let bodyBuffer;
    if (event.isBase64Encoded) {
      bodyBuffer = Buffer.from(event.body, 'base64');
    } else {
      bodyBuffer = Buffer.from(event.body);
    }
    
    console.log('Body buffer length:', bodyBuffer.length);

    // Create readable stream for formidable
    const mockReq = new Readable();
    mockReq.push(bodyBuffer);
    mockReq.push(null);
    
    mockReq.headers = {
      'content-type': event.headers['content-type'] || event.headers['Content-Type'],
      'content-length': bodyBuffer.length.toString()
    };
    mockReq.method = event.httpMethod;

    // Updated for formidable v3 - different API
    const form = formidable({
      multiples: true,
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      maxTotalFileSize: 10 * 1024 * 1024, // 10MB total
      maxFields: 100,
      maxFieldsSize: 2 * 1024 * 1024 // 2MB for field data
    });

    // Parse with timeout for formidable v3
    const parsePromise = new Promise((resolve, reject) => {
      form.parse(mockReq, (err, fields, files) => {
        if (err) {
          console.error('Form parsing error:', err);
          reject(err);
        } else {
          console.log('Form parsed successfully');
          console.log('Fields received:', Object.keys(fields));
          console.log('Files received:', Object.keys(files));
          resolve([fields, files]);
        }
      });
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Form parsing timeout')), 25000);
    });

    const [fields, files] = await Promise.race([parsePromise, timeoutPromise]);

    // Check for honeypot
    if (fields['bot-field'] && fields['bot-field'].toString().trim() !== '') {
      console.log('Honeypot triggered - likely spam');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html><body>
            <h1>Spam Detected</h1>
            <p>Your submission was flagged as potential spam.</p>
            <p><a href="/">Go back to form</a></p>
          </body></html>
        `
      };
    }

    // Helper function for formidable v3 field handling
    const getFieldValue = (field) => {
      if (!field) return '';
      if (Array.isArray(field)) {
        return field.map(f => typeof f === 'object' && f.value !== undefined ? f.value : f.toString()).join(', ');
      }
      return typeof field === 'object' && field.value !== undefined ? field.value : field.toString();
    };

    // Process fields
    const filteredData = {};
    Object.keys(fields).forEach(key => {
      if (key === 'bot-field') return;
      
      const value = getFieldValue(fields[key]);
      if (value && value.trim().length > 0) {
        // Handle date formatting
        if (key === 'date' || key === 'debt_incurred_date') {
          const dateParts = value.split('-');
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts;
            filteredData[key] = `${day}/${month}/${year}`;
          } else {
            filteredData[key] = value;
          }
        } else {
          filteredData[key] = value.substring(0, 1000); // Limit field length
        }
      }
    });

    console.log('Filtered data keys:', Object.keys(filteredData));

    // Field name mapping for better readability
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
    Object.entries(filteredData).forEach(([key, value]) => {
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
        </body>
      </html>
    `;

    // Handle file attachments with updated formidable v3 API
    console.log('Processing attachments...');
    const attachments = [];
    const fs = require('fs');
    
    if (files && Object.keys(files).length > 0) {
      Object.entries(files).forEach(([fieldName, file]) => {
        if (file) {
          const fileArray = Array.isArray(file) ? file : [file];
          fileArray.forEach(f => {
            // Updated for formidable v3 - filepath property
            if (f.filepath && f.originalFilename) {
              try {
                const content = fs.readFileSync(f.filepath).toString('base64');
                attachments.push({
                  content,
                  filename: f.originalFilename,
                  type: f.mimetype || 'application/octet-stream',
                  disposition: 'attachment'
                });
                console.log(`Attached file: ${f.originalFilename}`);
                
                // Clean up temp file
                fs.unlinkSync(f.filepath);
              } catch (fileError) {
                console.error(`Error processing file ${f.originalFilename}:`, fileError);
              }
            }
          });
        }
      });
    }

    console.log('Total attachments processed:', attachments.length);

    // Determine recipient
    let recipient = filteredData['send_to'] || 'greg@mettams.com.au';
    if (recipient === 'other' && filteredData['send_to_other']) {
      recipient = filteredData['send_to_other'];
    }
    
    console.log('Sending email to:', recipient);

    // Prepare and send email
    const msg = {
      to: recipient,
      from: {
        email: process.env.SENDGRID_SENDER_EMAIL,
        name: 'Galvins Instruction Form'
      },
      subject: `New Instruction Sheet - ${filteredData['signature'] || 'Unknown'}`,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined
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
              ${attachments.length > 0 ? `<p>Included ${attachments.length} attachment(s).</p>` : ''}
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
    
    if (error.response) {
      console.error('SendGrid response status:', error.response.status);
      console.error('SendGrid response body:', JSON.stringify(error.response.body, null, 2));
    }

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
              <p>There was an error processing your form submission.</p>
              <p>Error: ${error.message}</p>
              <p>Please try again or contact support if the problem persists.</p>
              <a href="/" class="btn">Go Back to Form</a>
            </div>
          </body>
        </html>
      `
    };
  }
};