const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');
const fs = require('fs');
const { Readable } = require('stream');

exports.handler = async (event) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    // Decode the base64-encoded body from Netlify event
    const bodyBuffer = Buffer.from(event.body, 'base64');

    // Create a readable stream from the buffer to emulate HTTP request for Formidable
    const mockReq = new Readable();
    mockReq.push(bodyBuffer);
    mockReq.push(null); // End the stream
    mockReq.headers = event.headers;
    mockReq.method = event.httpMethod;

    const form = new formidable.IncomingForm({ multiples: true });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(mockReq, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Filter empty fields and format data (adapt your original logic)
    const filteredData = {};
    Object.keys(fields).forEach(key => {
      let value = fields[key];
      if (value && value.trim().length > 0) {
        // Handle dates if needed
        if (key === 'date' || key === 'debt_incurred_date') {
          const [year, month, day] = value.split('-');
          filteredData[key] = `${day}/${month}/${year}`;
        } else if (Array.isArray(value)) {
          filteredData[key] = value.join(', ');
        } else {
          filteredData[key] = value;
        }
      }
    });

    // Build HTML table for email body
    let tableRows = '';
    Object.entries(filteredData).forEach(([key, value]) => {
      tableRows += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${key}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${value}</td>
        </tr>
      `;
    });

    const htmlBody = `
      <html>
        <body>
          <h2>New Form Submission</h2>
          <p>A new instruction sheet has been submitted.</p>
          <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
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
        </body>
      </html>
    `;

    // Prepare attachments for SendGrid
    const attachments = [];
    Object.values(files).forEach(file => {
      if (file) {
        const fileArray = Array.isArray(file) ? file : [file];
        fileArray.forEach(f => {
          const content = fs.readFileSync(f.filepath).toString('base64');
          attachments.push({
            content,
            filename: f.originalFilename,
            type: f.mimetype,
            disposition: 'attachment'
          });
        });
      }
    });

    // Determine recipient (from form or default)
    const recipient = filteredData['send_to'] || 'greg@mettams.com.au'; // Adjust based on your form field

    const msg = {
      to: recipient,
      from: 'greg@mettams.com.au', // Verified sender
      subject: 'New Instruction Sheet Submission',
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    await sgMail.send(msg);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email sent successfully' })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process form and send email' })
    };
  }
};
