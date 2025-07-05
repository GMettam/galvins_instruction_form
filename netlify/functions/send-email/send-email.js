// Use Netlify's built-in email capability (no nodemailer needed)
exports.handler = async (event) => {
  try {
    const { to, formData } = JSON.parse(event.body);
    
    await require('netlify-lambda').sendEmail({
      from: process.env.NETLIFY_EMAIL_USER,
      to,
      subject: "New Form Submission",
      text: `Form data:\n${JSON.stringify(formData, null, 2)}`
    });

    return { statusCode: 200, body: "Email sent" };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
};
