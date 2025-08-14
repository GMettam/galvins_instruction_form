const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  // All your logic MUST be inside this handler function
  const params = new URLSearchParams(event.body);

  // Log every received field and its value
  console.log('Received form fields:', Object.fromEntries(params.entries()));

  // Map form field names to friendly labels
  const fieldMapping = {
    amount: 'Amount ($) *',
    claimType: 'Claim Type',
    debtDate: 'Debt incurred from',
    goodsDetails: 'Details of Goods Sold',
    debtDetails: 'Details of Debt Incurred',
    otherClaimDetails: 'Other Claim Type Details',
    accountNo: 'Account No.',
    debtorType: 'Debtor Type',
    fullName: 'Full Name *',
    mobilePhone: 'Mobile Phone *',
    email: 'Email Address *',
    acnAbn: 'ACN/ABN',
    homeAddress: 'Home Address *',
    partnershipName: 'Partnership Name *',
    contactPhone: 'Contact Phone *',
    partnersNames: "Partners' Names *",
    businessAddress: 'Business Address *',
    companyName: 'Company Name *',
    registeredOffice: 'Registered Office *',
    guarantorNames: "Guarantor(s) Names *",
    guarantorPhones: 'Phone Number(s)',
    guarantorAddresses: "Guarantor(s) Addresses *",
    guarantorEmails: 'Email Address(es)',
    action: 'Action',
    demandLetterDays: 'Demand Letter Days',
    demandLetterDetails: 'Demand Letter Details',
    propertyDetails: 'Property Details for Caveat',
    summonsDetails: 'Details for Issuing Summons',
    otherActionDetails: 'Other Action Details',
    documentType: 'Document Type',
    guaranteeDetails: 'Guarantee & Indemnity Details',
    invoiceDetails: 'Invoice / Statement Details',
    accountAppDetails: 'Account Application Details',
    otherDocument: 'Other Document',
    attachments: 'Attachments',
  };

  // Build rows only for fields that have values
  const rowsHtml = Object.entries(fieldMapping)
    .map(([fieldName, label]) => {
      const value = params.get(fieldName);
      if (value && value.trim()) {
        return `
          <tr>
            <th style="padding:12px;border:1px solid #ddd;background-color:#f8f9fa;text-align:left;font-weight:600;color:#333;">
              ${label}
            </th>
            <td style="padding:12px;border:1px solid #ddd;color:#555;">
              ${value}
            </td>
          </tr>`;
      }
      return '';
    })
    .filter((row) => row !== '')
    .join('');

  // Build a plain-text fallback
  const textBody = Object.entries(fieldMapping)
    .map(([fieldName, label]) => {
      const value = params.get(fieldName);
      return value && value.trim() ? `${label}: ${value}` : null;
    })
    .filter((line) => line)
    .join('\n');

  // Enhanced HTML with better styling
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <h2 style="color:#2c3e50;margin-bottom:20px;text-align:center;">New Form Submission</h2>
      <table style="border-collapse:collapse;width:100%;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#666;text-align:center;">
        Submitted on ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  // Build your SendGrid message with both text and HTML
  const msg = {
    to: 'gregorymettam@gmail.com',
    from: 'gregorymettam@gmail.com',
    subject: 'New Form Submission',
    text: textBody,
    html: htmlBody,
  };

  try {
    await sgMail.send(msg);
    return { statusCode: 200, body: 'Email sent successfully.' };
  } catch (err) {
    console.error('SendGrid error:', err);
    if (err.response) console.error(err.response.body);
    return { statusCode: err.code || 500, body: err.message };
  }
};