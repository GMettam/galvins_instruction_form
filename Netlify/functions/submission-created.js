// --- Helper Libraries ---
const sgMail = require('@sendgrid/mail');
const parser = require('lambda-multipart-parser');

// --- Main Function ---
exports.handler = async (event) => {
  // --- 1. SET UP SENDGRID ---
  // We securely get your SendGrid API key from the Netlify environment
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  try {
    // --- 2. PARSE THE FORM DATA ---
    // The event body from Netlify is a single string; the parser
    // turns it into a useful object that separates fields and files.
    const result = await parser.parse(event);
    const formData = result.files.reduce((acc, file) => {
        // The parser treats all fields, including files, as entries in the 'files' array.
        // We separate them here. 'filename' being present indicates a file.
        if (file.filename) {
            if (!acc.attachments) acc.attachments = [];
            acc.attachments.push(file);
        } else {
            // Handle checkbox groups (e.g., 'claim_type[]')
            const fieldName = file.fieldname.replace('[]', '');
            if (acc[fieldName]) {
                if (!Array.isArray(acc[fieldName])) {
                    acc[fieldName] = [acc[fieldName]];
                }
                acc[fieldName].push(file.data.toString());
            } else {
                acc[fieldName] = file.data.toString();
            }
        }
        return acc;
    }, {});


    // --- 3. FILTER EMPTY FIELDS & FORMAT DATA ---
    const filteredData = {};
    Object.keys(formData).forEach(key => {
        // We only keep fields that have a value and are not our file attachments
        if (formData[key] && key !== 'attachments' && formData[key].length > 0) {
            
            // Reformat the date field if it exists
            if (key === 'date' || key === 'debt_incurred_date') {
                const [year, month, day] = formData[key].split('-');
                filteredData[key] = `${day}/${month}/${year}`;
            } 
            // Join checkbox arrays into a nice comma-separated string
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
    const attachments = (formData.attachments || []).map(file => ({
        content: file.content.toString('base64'),
        filename: file.filename,
        type: file.contentType,
        disposition: 'attachment',
    }));

    // --- 6. ASSEMBLE AND SEND THE EMAIL ---
    // Determine the recipient from the form's "send_to" fields
    const recipient = filteredData.send_to === 'other' ? filteredData.send_to_other : filteredData.send_to;
    if (!recipient) {
      throw new Error("No recipient email address was specified in the form.");
    }
    
    const msg = {
      to: recipient,
      // IMPORTANT: Replace this with an email address you have verified in SendGrid
      from: 'greg@mettams.com.au', 
      subject: 'New Instruction Sheet Submission',
      html: htmlBody,
      attachments: attachments,
    };

    await sgMail.send(msg);

    // --- 7. RETURN A SUCCESS RESPONSE ---
    // This tells Netlify that the function ran without errors.
    return {
      statusCode: 200,
      body: 'Email sent successfully',
    };

  } catch (error) {
    // --- 8. HANDLE ERRORS ---
    // If anything goes wrong, we log the error and tell Netlify.
    console.error('Error processing submission:', error);
    return {
      statusCode: 500,
      body: `Error: ${error.message}`,
    };
  }
};