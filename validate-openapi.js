#!/usr/bin/env node

/**
 * OpenAPI Specification Validator
 * 
 * This script validates the generated OpenAPI specification.
 */

const SwaggerParser = require('swagger-parser');
const path = require('path');

async function validateOpenAPISpec() {
  try {
    const apiPath = path.join(__dirname, 'openapi.yaml');
    console.log('Validating OpenAPI specification...');
    
    const api = await SwaggerParser.validate(apiPath);
    console.log('✅ OpenAPI specification is valid!');
    console.log(`API name: ${api.info.title}`);
    console.log(`Version: ${api.info.version}`);
    console.log(`Total paths: ${Object.keys(api.paths).length}`);
    console.log(`Total tags: ${api.tags.length}`);
    
    // Display some statistics
    const pathMethods = {};
    Object.keys(api.paths).forEach(path => {
      Object.keys(api.paths[path]).forEach(method => {
        if (!pathMethods[method]) pathMethods[method] = 0;
        pathMethods[method]++;
      });
    });
    
    console.log('\nHTTP Methods:');
    Object.keys(pathMethods).forEach(method => {
      console.log(`  ${method.toUpperCase()}: ${pathMethods[method]} endpoints`);
    });
    
    console.log('\nTags:');
    api.tags.forEach(tag => {
      console.log(`  - ${tag.name}: ${tag.description}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ OpenAPI specification validation failed:');
    console.error(error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    return false;
  }
}

// Run validation
if (require.main === module) {
  validateOpenAPISpec()
    .then(isValid => {
      process.exit(isValid ? 0 : 1);
    })
    .catch(error => {
      console.error('Validation error:', error);
      process.exit(1);
    });
}

module.exports = { validateOpenAPISpec };