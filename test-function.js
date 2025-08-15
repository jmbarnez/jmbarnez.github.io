// Test script to verify our function works
const { handler } = require('./netlify/functions/test.js');

// Mock event and context
const mockEvent = {
  httpMethod: 'GET',
  path: '/api/test',
  headers: {},
  body: null
};

const mockContext = {};

// Test the function
handler(mockEvent, mockContext)
  .then(result => {
    console.log('Function result:', result);
    console.log('Status:', result.statusCode);
    console.log('Body:', result.body);
  })
  .catch(error => {
    console.error('Function error:', error);
  });