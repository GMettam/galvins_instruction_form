// Create this as netlify/functions/basic-test.js

exports.handler = async (event) => {
  console.log('Basic test function started');
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html'
    },
    body: `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Basic Test</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .success { color: green; font-size: 2em; }
          </style>
        </head>
        <body>
          <div class="success">✓ Basic Function Works!</div>
          <p>Method: ${event.httpMethod}</p>
          <p>Time: ${new Date().toISOString()}</p>
          <p>Environment variables exist:</p>
          <ul style="text-align: left; display: inline-block;">
            <li>SENDGRID_API_KEY: ${!!process.env.SENDGRID_API_KEY}</li>
            <li>SENDGRID_SENDER_EMAIL: ${!!process.env.SENDGRID_SENDER_EMAIL}</li>
          </ul>
          <p><a href="/">Go back</a></p>
        </body>
      </html>
    `
  };
};