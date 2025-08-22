const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');
const fs = require('fs');
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

  // Check if required environment variables exist
  if (!process.env.SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY environment variable is missing');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html><body>
          <h1>Configuration Error</h1>
          <p>SendGrid API key not configured. Please contact the administrator.</p>
          <p><a href="/">Go back to form</a></p>
        </body></html>
      `
    };
  }

  if (!process.env.SENDGRID_SENDER_EMAIL) {
    console.error('SENDGRID_SENDER_EMAIL environment variable is missing');
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html><body>
          <h1>Configuration Error</h1>
          <p>SendGrid sender email not configured. Please contact the administrator.</p>
          <p><a href="/">Go back to form</a></p>
        </body></html>
      `
    };
  }

  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    console.log('Starting form parsing...');
    
    // Handle the body properly - check if it's already a buffer or needs decoding
    let bodyBuffer;
    if (event.isBase64Encoded) {
      bodyBuffer = Buffer.from(event.body, 'base64');
    } else {
      bodyBuffer = Buffer.from(event.body);
    }
    
    console.log('Body buffer length:', bodyBuffer.length);
    console.log('First 100 chars of body:', bodyBuffer.toString().substring(0, 100));

    // Create a mock request stream for formidable
    const mockReq = new Readable();
    mockReq.push(bodyBuffer);
    mockReq.push(null);
    
    // Ensure proper headers for formidable
    mockReq.headers = {
      'content-type': event.headers['content-type'] || event.headers['Content-Type'],
      'content-length': bodyBuffer.length.toString()
    };
    mockReq.method = event.httpMethod;

    // Parse the form data with better options
    const form = new formidable.IncomingForm({ 
      multiples: true,
      keepExtensions: true,
      maxFileSize: 10 * 1024 * 1024 // 10MB limit
    });
    
    const [fields, files] = await new Promise((resolve, reject) => {
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

    // Check for honeypot (spam protection)
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

    // Helper function to get field value (handle arrays and single values)
    const getFieldValue = (field) => {
      if (!field) return '';
      if (Array.isArray(field)) {
        return field.join(', ');
      }
      return field.toString();
    };

    // Filter and format fields
    const filteredData = {};
    Object.keys(fields).forEach(key => {
      if (key === 'bot-field') return; // Skip honeypot field
      
      const value = getFieldValue(fields[key]);
      if (value && value.trim().length > 0) {
        if (key === 'date' || key === 'debt_incurred_date') {
          // Convert YYYY-MM-DD to DD/MM/YYYY
          const dateParts = value.split('-');
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts;
            filteredData[key] = `${day}/${month}/${year}`;
          } else {
            filteredData[key] = value;
          }
        } else {
          filteredData[key] = value;
        }
      }
    });

    console.log('Filtered data keys:', Object.keys(filteredData));

    // Create a more readable field name mapping
    const fieldNameMap = {
      'amount': 'Claim Amount',
      'claim_type': 'Claim Type',
      'debt_incurred_date': 'Debt Incurred Date',
      'account_no': 'Account Number',
      'debtor_type': 'Debtor Type',
      'send_to': 'Send To',
      'signature': 'Signature',
      'date': 'Date Signed',
      'comments': 'Comments'
      // Add more mappings as needed
    };

    // Build HTML table rows with better formatting
    let tableRows = '';
    Object.entries(filteredData).forEach(([key, value]) => {
      const displayName = fieldNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const displayValue = value.length > 100 ? value.substring(0, 100) + '...' : value;
      
      tableRows += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 12px; font-weight: bold; background-color: #f9f9f9; width: 200px; vertical-align: top;">
            ${displayName}
          </td>
          <td style="border: 1px solid #ddd; padding: 12px; word-wrap: break-word;">
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
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            th, td { text-align: left; }
            .header { background-color: #667eea; color: white; padding: 20px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Galvins - New Instruction Sheet Submission</h1>
            <p>Submitted on: ${new Date().toLocaleString('en-AU')}</p>
          </div>
          
          <h2>Submission Details</h2>
          <table>
            <thead>
              <tr>
                <th style="border: 1px solid #ddd; padding: 12px; background-color: #f2f2f2;">Field</th>
                <th style="border: 1px solid #ddd; padding: 12px; background-color: #f2f2f2;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `;

    // Prepare attachments
    console.log('Processing attachments...');
    const attachments = [];
    
    if (files && Object.keys(files).length > 0) {
      Object.entries(files).forEach(([fieldName, file]) => {
        if (file) {
          const fileArray = Array.isArray(file) ? file : [file];
          fileArray.forEach(f => {
            if (f.filepath && f.originalFilename) {
              try {
                const content = fs.readFileSync(f.filepath).toString('base64');
                attachments.push({
                  content,
                  filename: f.originalFilename,
                  type: f.mimetype || 'application/octet-stream',
                  disposition: 'attachment'
                });
                console.log(`Attached file: ${f.originalFilename} (${f.mimetype})`);
                
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
    console.log('Sending email from:', process.env.SENDGRID_SENDER_EMAIL);

    // Prepare email
    const msg = {
      to: recipient,
      from: {
        email: process.env.SENDGRID_SENDER_EMAIL,
        name: 'Galvins Instruction Form'
      },
      subject: `New Instruction Sheet Submission - ${filteredData['signature'] || 'Unknown'}`,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    console.log('Attempting to send email via SendGrid...');
    const response = await sgMail.send(msg);
    console.log('Email sent successfully! Response:', response[0].statusCode);

    // Success response
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
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
              <p>Your instruction sheet has been submitted successfully and sent to <strong>${recipient}</strong>.</p>
              <p>You should receive a confirmation shortly.</p>
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
    
    // Log SendGrid specific errors
    if (error.response) {
      console.error('SendGrid response status:', error.response.status);
      console.error('SendGrid response headers:', error.response.headers);
      console.error('SendGrid response body:', JSON.stringify(error.response.body, null, 2));
    }

    // Return user-friendly error
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/html'
      },
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
              <p>There was an error processing your form submission. Please try again.</p>
              <p>If the problem persists, please contact support.</p>
              <a href="/" class="btn">Go Back to Form</a>
            </div>
          </body>
        </html>
      `
    };
  }
};