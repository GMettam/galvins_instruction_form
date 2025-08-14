const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  // For submission-created functions, the data is in a different place
  const payload = JSON.parse(event.body).payload;
  const formData = payload.data;

  const fieldMapping = {
    amount: 'Amount ($)',
    'claim_type[]': 'Claim Type', 
    debt_incurred_date: 'Debt incurred from',
    goods_sold_details: 'Details of Goods Sold',
    debt_incurred_details: 'Details of Debt Incurred',
    claim_other_details: 'Other Claim Type Details',
    account_no: 'Account No.',
    debtor_type: 'Debtor Type',
    // Consolidate the different "name" fields into one
    fullName: 'Full Name', 
    mobilePhone: 'Mobile Phone',
    email: 'Email Address',
    acnAbn: 'ACN/ABN',
    homeAddress: 'Home Address',
    partnershipName: 'Partnership Name',
    contactPhone: 'Contact Phone',
    partnersNames: "Partners' Names",
    businessAddress: 'Business Address',
    companyName: 'Company Name',
    registeredOffice: 'Registered Office',
    guarantorNames: "Guarantor(s) Names",
    guarantorPhones: 'Phone Number(s)',
    guarantorAddresses: "Guarantor(s) Addresses",
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
    signature: 'Signature',
    date: 'Date',
    send_to: 'Send to',
    send_to_other: 'Other Recipient',
  };

  // Consolidate conditional fields into common names so they appear correctly
  const consolidatedData = {
    ...formData,
    fullName: formData.sp_full_name || formData.c_full_name || formData.p_partners_names,
    mobilePhone: formData.sp_mobile,
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
    guarantorEmails: formData.g_guarantor_emails
  };
  
  // Build rows only for fields that have values
  let rowsHtml = Object.entries(fieldMapping)
    .map(([fieldName, label]) => {
      // Use the consolidated data to find the value
      const value = consolidatedData[fieldName];
      
      // Check if the value exists and isn't just whitespace
      if (value && String(value).trim()) {
        // For array values (from checkboxes), join them with commas
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        return `
          <tr>
            <th style="padding: 12px; border: 1px solid #ddd; background-color: #f8f9fa; text-align: left; font-weight: 600; color: #333;">
              ${label}
            </th>
            <td style="padding: 12px; border: 1px solid #ddd; color: #555;">
              ${displayValue}
            </td>
          </tr>`;
      }
      return ''; // Return an empty string for empty fields
    })
    .filter(row => row !== '') // Filter out the empty strings
    .join('');

  // Add file upload info if present
  if (payload.files && payload.files.length > 0) {
      const fileLinks = payload.files.map(file => `<a href="${file.url}">${file.filename}</a>`).join('<br>');
      rowsHtml += `
          <tr>
            <th style="padding: 12px; border: 1px solid #ddd; background-color: #f8f9fa; text-align: left; font-weight: 600; color: #333;">
              Uploaded Files
            </th>
            <td style="padding: 12px; border: 1px solid #ddd; color: #555;">
              ${fileLinks}
            </td>
          </tr>
      `;
  }

  // If no fields were filled out at all, display a message instead of an empty table
  if (!rowsHtml) {
    rowsHtml = `<tr><td style="padding: 12px; text-align: center;">No information was entered in the form.</td></tr>`;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #2c3e50; margin-bottom: 20px; text-align: center;">New Form Submission</h2>
      <table style="border-collapse: collapse; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">
        Submitted on ${new Date(payload.created_at).toLocaleString()}
      </p>
    </div>
  `;

  // Determine the recipient
  const recipient = consolidatedData.send_to === 'other' ? consolidatedData.send_to_other : consolidatedData.send_to;
  
  const msg = {
    to: recipient,
    from: 'gregorymettam@gmail.com', // MUST be a verified sender in SendGrid
    subject: `New Instruction Sheet Submission - #${payload.number}`,
    html: htmlBody,
  };
  
  try {
    if (!recipient) throw new Error("No recipient specified.");
    await sgMail.send(msg);
    return { statusCode: 200, body: 'Email sent successfully.' };
  } catch (err) {
    console.error('Error:', err.toString());
    return { statusCode: 500, body: err.toString() };
  }
};