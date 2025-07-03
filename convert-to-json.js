#!/usr/bin/env node

/**
 * Convert OpenAPI YAML to JSON format
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function convertYamlToJson() {
  try {
    const yamlPath = path.join(__dirname, 'openapi.yaml');
    const jsonPath = path.join(__dirname, 'openapi.json');
    
    console.log('Reading OpenAPI YAML specification...');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    
    console.log('Converting YAML to JSON...');
    const jsonObject = yaml.load(yamlContent);
    
    console.log('Writing JSON specification...');
    fs.writeFileSync(jsonPath, JSON.stringify(jsonObject, null, 2));
    
    console.log(`✅ OpenAPI JSON specification created: ${jsonPath}`);
    console.log(`File size: ${(fs.statSync(jsonPath).size / 1024).toFixed(1)} KB`);
    
  } catch (error) {
    console.error('❌ Error converting YAML to JSON:', error.message);
    process.exit(1);
  }
}

// Run conversion
if (require.main === module) {
  convertYamlToJson();
}

module.exports = { convertYamlToJson };