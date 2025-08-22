// Create this as netlify/functions/table-format.js

const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');
const fs = require('fs');

exports.handler = async (event) => {
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    if (!event.body) {
      throw new Error('No form data received');
    }

    // Handle both URL-encoded and multipart data
    let formData = {};
    let attachments = [];
    
    const contentType = event.headers['content-type'] || '';
    
    if (contentType.includes('multipart/form-data')) {
      // File uploads present - use formidable
      const { Readable } = require('stream');
      
      const bodyBuffer = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64') : 
        Buffer.from(event.body);
      
      const mockReq = new Readable();
      mockReq.push(bodyBuffer);
      mockReq.push(null);
      mockReq.headers = {
        'content-type': contentType,
        'content-length': bodyBuffer.length.toString()
      };
      
      const form = new formidable.IncomingForm({
        multiples: true,
        keepExtensions: true,
        maxFileSize: 5 * 1024 * 1024 // 5MB limit
      });
      
      const [fields, files] = await new Promise((resolve, reject) => {
        form.parse(mockReq, (err, fields, files) => {
          if (err) reject(err);
          else resolve([fields, files]);
        });
      });
      
      // Process fields with date formatting
      Object.keys(fields).forEach(key => {
        if (key !== 'bot-field' && fields[key]) {
          const value = fields[key];
          let processedValue = Array.isArray(value) ? value.join(', ') : value.toString();
          
          // Convert dates from yyyy-mm-dd to dd/mm/yyyy
          if ((key === 'date' || key === 'debt_incurred_date') && processedValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = processedValue.split('-');
            processedValue = `${day}/${month}/${year}`;
          }
          
          formData[key] = processedValue;
        }
      });
      
      // Process files
      if (files && Object.keys(files).length > 0) {
        Object.values(files).forEach(file => {
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
                  // Clean up temp file
                  fs.unlinkSync(f.filepath);
                } catch (fileError) {
                  console.error('File processing error:', fileError);
                }
              }
            });
          }
        });
      }
      
    } else {
      // No files - use simple URL-encoded parsing
      const bodyData = event.isBase64Encoded ? 
        Buffer.from(event.body, 'base64').toString() : 
        event.body;
      
      const querystring = require('querystring');
      const parsed = querystring.parse(bodyData);
      
      Object.keys(parsed).forEach(key => {
        if (key !== 'bot-field' && parsed[key]) {
          let value = Array.isArray(parsed[key]) ? parsed[key].join(', ') : parsed[key].toString();
          
          // Convert dates from yyyy-mm-dd to dd/mm/yyyy
          if ((key === 'date' || key === 'debt_incurred_date') && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = value.split('-');
            value = `${day}/${month}/${year}`;
          }
          
          formData[key] = value;
        }
      });
    }

    // Field name mapping for better display
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
      'action': 'Actions Required',
      'document_type': 'Required Documents',
      'goods_sold_details': 'Goods Sold Details',
      'debt_incurred_details': 'Debt Incurred Details',
      'demand_letter_details': 'Demand Letter Details',
      'demand_letter_days': 'Demand Letter Days'
    };

    // Build HTML email with table
    let tableRows = '';
    Object.entries(formData).forEach(([key, value]) => {
      if (value && value.trim()) {
        const displayName = fieldNameMap[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
        
        tableRows += `
          <tr>
            <td style="border: 1px solid #ccc; padding: 8px; font-weight: bold; background-color: #f9f9f9; width: 250px; vertical-align: top;">
              ${displayName}
            </td>
            <td style="border: 1px solid #ccc; padding: 8px; word-wrap: break-word;">
              ${displayValue.replace(/\n/g, '<br>')}
            </td>
          </tr>
        `;
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.4; }
            table { border-collapse: collapse; width: 100%; margin-top: 20px; }
            .header { background-color: #667eea; color: white; padding: 15px; margin-bottom: 20px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>GALVINS - Instruction Sheet Submission</h1>
            <p>Submitted: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Perth' })}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="border: 1px solid #ccc; padding: 10px; background-color: #e9ecef; text-align: left;">Field</th>
                <th style="border: 1px solid #ccc; padding: 10px; background-color: #e9ecef; text-align: left;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          
          ${attachments.length > 0 ? `<p style="margin-top: 20px;"><strong>Attachments:</strong> ${attachments.length} file(s) attached</p>` : ''}
          
          <p style="margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 15px;">
            This form submission was processed automatically by the Galvins instruction form system.
          </p>
        </body>
      </html>
    `;

    // Determine recipient
    let recipient = formData.send_to_other || formData.send_to || 'greg@mettams.com.au';
    if (recipient === 'other') recipient = 'greg@mettams.com.au';
    
    // Send email
    const emailMessage = {
      to: recipient,
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: `Instruction Sheet - ${formData.signature || 'Unknown'}`,
      html: htmlContent
    };
    
    if (attachments.length > 0) {
      emailMessage.attachments = attachments;
    }
    
    await sgMail.send(emailMessage);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1>Success!</h1>
            <p>Form submitted to ${recipient}</p>
            ${attachments.length > 0 ? `<p>${attachments.length} file(s) attached</p>` : ''}
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