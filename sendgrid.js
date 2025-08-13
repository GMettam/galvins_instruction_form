const sgMail = require('@sendgrid/mail');

// Reads SendGrid API key from Netlify environment variables
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Update these with your verified sender and recipients
const SENDER_EMAIL = 'gregorymettam@gmail.com'; // Must be a verified sender in SendGrid
const RECIPIENTS = ['gregorymettam@gmail.com', 'jziatas@galvins.com.au']; // Add more if needed

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (error) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  // Filter out empty fields
  const filledFields = Object.entries(data)
    .filter(([key, value]) => value && value.trim() !== '');

  // Build HTML table with only entered fields
  const tableRows = filledFields
    .map(([key, value]) =>
      `<tr><td style="font-weight:bold;padding:4px 8px;border:1px solid #ccc;">${key}</td>
       <td style="padding:4px 8px;border:1px solid #ccc;">${value}</td></tr>`
    )
    .join('');

  const htmlContent = `
    <h2>New Galvins Instruction Form Submission</h2>
    <table style="border-collapse:collapse;border:1px solid #ccc;">
      ${tableRows}
    </table>
  `;

  const msg = {
    to: RECIPIENTS,
    from: SENDER_EMAIL,
    subject: 'New Galvins Instruction Form Submission',
    text: 'A new form entry has arrived.',
    html: htmlContent,
  };

  try {
    await sgMail.send(msg);
    return { statusCode: 200, body: 'Email sent successfully.' };
  } catch (error) {
    return {
      statusCode: 500,
      body: `Error sending email: ${error.message || error.toString()}`,
    };
  }
};
