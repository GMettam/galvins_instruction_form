const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const userTimezoneOffset = date.getTimezoneOffset() * 60000;
  const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
  const day = String(adjustedDate.getDate()).padStart(2, '0');
  const month = String(adjustedDate.getMonth() + 1).padStart(2, '0');
  const year = adjustedDate.getFullYear();
  return `${day}/${month}/${year}`;
};

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

exports.handler = async (event) => {
  const payload = JSON.parse(event.body).payload;
  const formData = payload.data;

  let attachments = [];
  if (payload.files && payload.files.length > 0) {
    attachments = await Promise.all(
      payload.files.map(async (file) => {
        try {
          const response = await fetch(file.url);
          if (!response.ok) {
            console.error(`Failed to download file: ${file.filename}`);
            return null;
          }
          // --- THIS IS THE CORRECTED LINE ---
          const fileBuffer = await response.buffer(); 
          const content = fileBuffer.toString('base64');
          
          return {
            content: content,
            filename: file.filename,
            type: file.type,
            disposition: 'attachment',
          };
        } catch (error) {
          console.error(`Error processing file ${file.filename}:`, error);
          return null;
        }
      })
    );
    attachments = attachments.filter(att => att !== null);
  }

  const fieldMapping = {
    amount: 'Amount ($)', 'claim_type[]': 'Claim Type', debt_incurred_date: 'Debt incurred from',
    goods_sold_details: 'Details of Goods Sold', debt_incurred_details: 'Details of Debt Incurred',
    claim_other_details: 'Other Claim Type Details', account_no: 'Account No.', debtor_type: 'Debtor Type',
    fullName: 'Full Name', mobilePhone: 'Mobile Phone', email: 'Email Address', acnAbn: 'ACN/ABN',
    homeAddress: 'Home Address', partnershipName: 'Partnership Name', contactPhone: 'Contact Phone',
    partnersNames: "Partners' Names", businessAddress: 'Business Address', companyName: 'Company Name',
    registeredOffice: 'Registered Office', guarantorNames: "Guarantor(s) Names", guarantorPhones: 'Phone Number(s)',
    guarantorAddresses: "Guarantor(s) Addresses", guarantorEmails: 'Email Address(es)', 'action[]': 'Action',
    demand_letter_days: 'Demand Letter Days', demand_letter_details: 'Demand Letter Details',
    caveat_details: 'Property Details for Caveat', issue_summons_details: 'Details for Issuing Summons',
    action_other_details: 'Other Action Details', 'document_type[]': 'Document Type',
    guarantee_details: 'Guarantee & Indemnity Details', invoice_details: 'Invoice / Statement Details',
    application_details: 'Account Application Details', doc_other_details: 'Other Document',
    comments: 'Comments', signature: 'Signature', date: 'Date', send_to: 'Send to', send_to_other: 'Other Recipient',
  };
  
  const consolidatedData = {
    ...formData,
    fullName: formData.sp_full_name || formData.c_full_name || formData.p_partners_names,
    mobilePhone: formData.sp_mobile, email: formData.sp_email || formData.p_email || formData.c_email,
    acnAbn: formData.sp_acn_abn || formData.p_acn_abn || formData.c_acn_abn, homeAddress: formData.sp_home_address,
    partnershipName: formData.p_partnership_name, contactPhone: formData.p_contact_phone || formData.c_contact_phone,
    partnersNames: formData.p_partners_names, businessAddress: formData.p_business_address || formData.c_business_address,
    companyName: formData.c_company_name, registeredOffice: formData.c_registered_office,
    guarantorNames: formData.g_guarantor_names, guarantorPhones: formData.g_guarantor_phones,
    guarantorAddresses: formData.g_guarantor_addresses, guarantorEmails: formData.g_guarantor_emails
  };
  
  let rowsHtml = Object.entries(fieldMapping)
    .map(([fieldName, label]) => {
      let value = consolidatedData[fieldName];
      if (fieldName === 'date' || fieldName === 'debt_incurred_date') {
        if (value) value = formatDate(value);
      }
      if (value && String(value).trim()) {
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        return `
          <tr>
            <th style="padding: 12px; border: 1px solid #ddd; background-color: #f8f9fa; text-align: left; font-weight: 600; color: #333;">${label}</th>
            <td style="padding: 12px; border: 1px solid #ddd; color: #555;">${displayValue}</td>
          </tr>`;
      }
      return '';
    })
    .filter(row => row !== '')
    .join('');

  if (!rowsHtml && attachments.length === 0) {
    rowsHtml = `<tr><td style="padding: 12px; text-align: center;">No information was entered in the form.</td></tr>`;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <h2 style="color: #2c3e50; margin-bottom: 20px; text-align: center;">New Form Submission</h2>
      <table style="border-collapse: collapse; width: 100%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <tbody>${rowsHtml}</tbody>
      </table>
      <p style="margin-top: 20px; font-size: 12px; color: #666; text-align: center;">
        Submitted on ${formatDate(payload.created_at)}
      </p>
    </div>`;
    
  const recipient = consolidatedData.send_to === 'other' ? consolidatedData.send_to_other : consolidatedData.send_to;
  
  const msg = {
    to: recipient,
    from: 'greg@mettams.com.au',
    subject: `New Instruction Sheet Submission - #${payload.number}`,
    html: htmlBody,
    attachments: attachments,
  };
  
  try {
    if (!recipient) throw new Error("No recipient specified.");
    await sgMail.send(msg);
    return { statusCode: 200, body: 'Email sent successfully.' };
  } catch (err) {
    console.error('Error sending email:', err.toString());
    return { statusCode: 500, body: err.toString() };
  }
};