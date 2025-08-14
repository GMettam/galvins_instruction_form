const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  // For submission-created functions, the data is in a different place
  const payload = JSON.parse(event.body).payload;
  const formData = payload.data;

  console.log('Received form data:', formData);

  const fieldMapping = {
    amount: 'Amount ($) *',
    // IMPORTANT: Checkbox arrays are joined with a comma by Netlify
    'claim_type[]': 'Claim Type', 
    debt_incurred_date: 'Debt incurred from',
    goods_sold_details: 'Details of Goods Sold',
    debt_incurred_details: 'Details of Debt Incurred',
    claim_other_details: 'Other Claim Type Details',
    account_no: 'Account No.',
    debtor_type: 'Debtor Type',
    // NOTE: The field names might be different based on which conditional section was filled
    // We will consolidate them here.
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
    'action[]': 'Action',
    demand_letter_days: 'Demand Letter Days',
    demand_letter_details: 'Demand Letter Details',
    caveat_details: 'Property Details for Caveat',
    issue_summons_details: 'Details for Issuing Summons',
    action_other_details: 'Other Action Details',
    'document_type[]': 'Document Type',
    guarantee_details: 'Guarantee & Indemnity Details',
    invoice_details: 'Invoice / Statement Details',
    application_details: 'Account Application Details',
    doc_other_details: 'Other Document',
    comments: 'Comments',
    signature: 'Signature *',
    date: 'Date *',
    send_to: 'Send to *',
    send_to_other: 'Other Recipient',
    // Netlify provides uploaded file info automatically
    attachments: 'Attachments'
  };

  // Consolidate conditional fields into common names
  const consolidatedData = {
    ...formData,
    fullName: formData.sp_full_name || formData.c_full_name, // Example, adjust as needed
    mobilePhone: formData.sp_mobile || formData.c_contact_phone || formData.p_contact_phone,
    email: formData.sp_email || formData.p_email || formData.c_email,
    acnAbn: formData.sp_acn_abn || formData.p_acn_abn || formData.c_acn_abn,
    homeAddress: formData.sp_home_address,
    partnershipName: formData.p_partnership_name,
    contactPhone: formData.p_contact_phone || formData.c_contact_phone,
    partnersNames: formData.p_partners_names,
    businessAddress: formData.p_business_address || formData.c_business_address,
    companyName: formData.c_company_name,
    registeredOffice: formData.c_registered_office,
    guarantorNames: formData.g_guarantor_names,
    guarantorPhones: formData.g_guarantor_phones,
    guarantorAddresses: formData.g_guarantor_addresses,
    guarantorEmails: formData.g_guarantor_emails,
  };
  
  // Build rows only for fields that have values
  const rowsHtml = Object.entries(fieldMapping)
    .map(([fieldName, label]) => {
      const value = consolidatedData[fieldName];
      
      if (value && String(value).trim()) {
        return `
          <tr>
            <th style="padding:12px;border:1px solid #ddd;background-color:#f8f9fa;text-align:left;font-weight:600;color:#333;">
              ${label}
            </th>
            <td style="padding:12px;border:1px solid #ddd;color:#555;">
              ${Array.isArray(value) ? value.join(', ') : value}
            </td>
          </tr>`;
      }
      return '';
    })
    .filter(row => row !== '')
    .join('');

  // Also include file upload info if present
  let fileInfoHtml = '';
  if (payload.files && payload.files.length > 0) {
      const fileLinks = payload.files.map(file => `<a href="${file.url}">${file.filename}</a>`).join('<br>');
      fileInfoHtml = `
          <tr>
            <th style="padding:12px;border:1px solid #ddd;background-color:#f8f9fa;text-align:left;font-weight:600;color:#333;">
              Uploaded Files
            </th>
            <td style="padding:12px;border:1px solid #ddd;color:#555;">
              ${fileLinks}
            </td>
          </tr>
      `;
  }

  // Enhanced HTML with better styling
  const htmlBody = `
    <div style="font-family:Arial,sans-serif;max-width:800px;margin:0 auto;">
      <h2 style="color:#2c3e50;margin-bottom:20px;text-align:center;">New Form Submission</h2>
      <table style="border-collapse:collapse;width:100%;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <tbody>
          ${rowsHtml}
          ${fileInfoHtml}
        </tbody>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#666;text-align:center;">
        Submitted on ${new Date(payload.created_at).toLocaleString()}
      </p>
    </div>
  `;

  // Determine the recipient
  const recipient = formData.send_to === 'other' ? formData.send_to_other : formData.send_to;
  
  const msg = {
    to: recipient,
    from: 'gregorymettam@gmail.com', // This should be a verified sender domain in SendGrid
    subject: `New Instruction Sheet Submission - ${payload.number}`,
    html: htmlBody,
  };
  
  try {
    if(!recipient) {
      throw new Error("No recipient specified.");
    }
    await sgMail.send(msg);
    return { statusCode: 200, body: 'Email sent successfully.' };
  } catch (err) {
    console.error('Error:', err);
    return { statusCode: err.code || 500, body: err.message };
  }
};
