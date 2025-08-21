const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');
const fs = require('fs');
const { Readable } = require('stream');

exports.handler = async (event) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    // Decode the body (Netlify functions always base64-encode the body)
    const bodyBuffer = Buffer.from(event.body, 'base64');

    // Create a mock request stream for formidable
    const mockReq = new Readable();
    mockReq.push(bodyBuffer);
    mockReq.push(null);
    mockReq.headers = event.headers;
    mockReq.method = event.httpMethod;

    // Parse the form data
    const form = new formidable.IncomingForm({ multiples: true });
    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(mockReq, (err, fields, files) => {
        if (err) reject(err);
        resolve([fields, files]);
      });
    });

    // Filter and format fields (fixing the date comparison)
    const filteredData = {};
    Object.keys(fields).forEach(key => {
      let value = fields[key];
      if (value && value.trim().length > 0) {
        if (key === 'date' || key === 'debt_incurred_date') {  // Fixed comparison
          const dateParts = value.split('-');
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts;
            filteredData[key] = `${day}/${month}/${year}`;
          } else {
            filteredData[key] = value;  // Fallback
          }
        } else if (Array.isArray(value)) {
          filteredData[key] = value.join(', ');
        } else {
          filteredData[key] = value;
        }
      }
    });

    // Build HTML table rows
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
          <h2>New Instruction Sheet Submission</h2>
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

    // Prepare attachments
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
          fs.unlinkSync(f.filepath);  // Clean up temp file
        });
      }
    });

    // Determine recipient and use env variable for sender
    const recipient = filteredData['send_to'] || 'greg@mettams.com.au';
    const msg = {
      to: recipient,
      from: process.env.SENDGRID_SENDER_EMAIL,  // Use env variable (required for SendGrid)
      subject: 'New Instruction Sheet Submission',
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    await sgMail.send(msg);

    return {
      statusCode: 302,
      headers: {
        Location: '/success.html'  // Adjust if needed
      },
      body: ''
    };
  } catch (error) {
    console.error('Error in function:', error);  // Improved logging for debugging
    if (error.response) {
      console.error('SendGrid response:', error.response.body);  // Log SendGrid-specific errors
    }

    return {
      statusCode: 302,
      headers: {
        Location: '/error.html'  // Adjust if needed
      },
      body: ''
    };
  }
};
