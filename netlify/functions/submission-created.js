 
// --- Helper Libraries ---

const sgMail = require('@sendgrid/mail');
const formidable = require('formidable');

exports.handler = async (event) => {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  // Decode the Base64 body from Netlify event
  const buf = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');

  // Emulate an HTTP request for formidable
  const mockReq = require('stream').Readable.from(buf);
  mockReq.headers = event.headers;
  mockReq.method = event.httpMethod;

  const form = new formidable.IncomingForm();
  return new Promise((resolve, reject) => {
    form.parse(mockReq, (err, fields, files) => {
      if (err) {
        return resolve({
          statusCode: 400,
          body: JSON.stringify({ error: 'Failed to parse form' })
        });
      }
      // fields: your parsed form fields
      // files: attachments
      // your SendGrid logic comes here...
      resolve({
        statusCode: 200,
        body: JSON.stringify({ fields, files })
      });
    });
  });
};

// --- Main Function ---
exports.handler = async (event) => {
  // --- 1. SET UP SENDGRID ---
  // Securely gets your SendGrid API key from the Netlify environment
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    // --- 2. PARSE THE FORM DATA ---
    // The event body from Netlify is a single string; the parser
    // turns it into a useful object with fields and files.
    const result = await parser.parse(event);
    
    const formData = {};
    const attachments = [];

    // Separate files from regular form fields
    result.files.forEach(file => {
      if (file.filename) {
        // This is a file attachment
        attachments.push(file);
      } else {
        // This is a regular field
        const fieldName = file.fieldname.replace('[]', '');
        if (formData[fieldName]) {
          if (!Array.isArray(formData[fieldName])) {
            formData[fieldName] = [formData[fieldName]];
          }
          formData[fieldName].push(file.data.toString());
        } else {
          formData[fieldName] = file.data.toString();
        }
      }
    });

    // --- 3. FILTER EMPTY FIELDS & FORMAT DATA ---
    const filteredData = {};
    Object.keys(formData).forEach(key => {
        // We only keep fields that have a value
        if (formData[key] && formData[key].length > 0) {
            
            // Reformat the date field if it exists
            if (key === 'date' || key === 'debt_incurred_date') {
                const [year, month, day] = formData[key].split('-');
                filteredData[key] = `${day}/${month}/${year}`;
            } 
            // Join checkbox arrays into a comma-separated string
            else if (Array.isArray(formData[key])) {
                filteredData[key] = formData[key].join(', ');
            }
            else {
                filteredData[key] = formData[key];
            }
        }
    });

    // --- 4. BUILD THE HTML EMAIL ---
    // We loop through our clean, filtered data to build the table rows
    const tableRows = Object.entries(filteredData)
      .map(([key, value]) => `
        <tr>
          <th style="text-align: left; padding: 8px; border: 1px solid #ddd; background-color: #f2f2f2; text-transform: capitalize;">${key.replace(/_/g, ' ')}</th>
          <td style="text-align: left; padding: 8px; border: 1px solid #ddd;">${value}</td>
        </tr>
      `)
      .join('');

    const htmlBody = `
      <h1>New Instruction Sheet Submission</h1>
      <p>A new form has been submitted from your website.</p>
      <table style="width: 100%; border-collapse: collapse;">${tableRows}</table>
    `;

    // --- 5. PREPARE ATTACHMENTS FOR SENDGRID ---
    // We convert the file data into the Base64 format that SendGrid requires
    const sendgridAttachments = attachments.map(file => ({
        content: file.content.toString('base64'),
        filename: file.filename,
        type: file.contentType,
        disposition: 'attachment',
    }));

    // --- 6. ASSEMBLE AND SEND THE EMAIL ---
    const recipient = filteredData.send_to === 'other' ? filteredData.send_to_other : filteredData.send_to;
    if (!recipient) {
      throw new Error("No recipient email address was specified in the form.");
    }
    
    const msg = {
      to: recipient,
      // IMPORTANT: This 'from' address MUST be a verified sender in your SendGrid account
      from: 'greg@mettams.com.au', 
      subject: 'New Instruction Sheet Submission',
      html: htmlBody,
      attachments: sendgridAttachments,
    };

    await sgMail.send(msg);

    // --- 7. RETURN A SUCCESS RESPONSE ---
    return {
      statusCode: 200,
      body: 'Email sent successfully',
    };

  } catch (error) {
    // --- 8. HANDLE ERRORS ---
    console.error('Error processing submission:', error);
    return {
      statusCode: 500,
      body: `Error: ${error.message}`,
    };
  }
};