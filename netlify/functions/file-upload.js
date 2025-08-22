// Create this as netlify/functions/file-upload.js

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
      
      const form = formidable({
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
      
      // Process fields
      Object.keys(fields).forEach(key => {
        if (key !== 'bot-field' && fields[key]) {
          const value = fields[key];
          formData[key] = Array.isArray(value) ? value.join(', ') : value.toString();
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
          formData[key] = Array.isArray(parsed[key]) ? parsed[key].join(', ') : parsed[key].toString();
        }
      });
    }

    // Build email content
    let emailContent = 'GALVINS INSTRUCTION SHEET\n\n';
    emailContent += `Submitted: ${new Date().toLocaleString()}\n\n`;
    
    // Key fields
    if (formData.amount) emailContent += `Amount: ${formData.amount}\n`;
    if (formData.signature) emailContent += `Signature: ${formData.signature}\n`;
    if (formData.debtor_type) emailContent += `Debtor Type: ${formData.debtor_type}\n`;
    
    emailContent += '\nAll Fields:\n';
    Object.keys(formData).forEach(key => {
      if (formData[key]) {
        emailContent += `${key}: ${formData[key]}\n`;
      }
    });
    
    if (attachments.length > 0) {
      emailContent += `\nAttachments: ${attachments.length} file(s) attached\n`;
    }

    // Determine recipient
    let recipient = formData.send_to_other || formData.send_to || 'greg@mettams.com.au';
    if (recipient === 'other') recipient = 'greg@mettams.com.au';
    
    // Send email
    const emailMessage = {
      to: recipient,
      from: process.env.SENDGRID_SENDER_EMAIL,
      subject: `Instruction Sheet - ${formData.signature || 'Unknown'}`,
      text: emailContent
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