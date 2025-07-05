#!/usr/bin/env node

/**
 * NASA APIs OpenAPI 3.0+ Generator
 * 
 * This script reads the NASA APIs metadata from apis.json and generates
 * a comprehensive OpenAPI 3.0+ specification covering all available APIs.
 * It properly parses HTML templates to extract endpoints, parameters, and descriptions.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const cheerio = require('cheerio');
const axios = require('axios');

// Read and parse the APIs JSON file
function loadApis() {
  const apisPath = path.join(__dirname, 'assets', 'json', 'apis.json');
  const apisData = fs.readFileSync(apisPath, 'utf8');
  return JSON.parse(apisData);
}

// Convert Swagger 2.0 to OpenAPI 3.0 components
function convertSwagger2ToOpenAPI3(swagger2Data) {
  const paths = {};
  const components = {
    securitySchemes: {},
    schemas: {}
  };

  // Helper function to clean up malformed schemas
  function cleanSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object' };
    }
    
    if (schema.type === 'array' && schema.items) {
      if (schema.items.thing === 'ok') {
        // Fix malformed APOD schema
        return {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', format: 'date' },
              explanation: { type: 'string' },
              hdurl: { type: 'string', format: 'uri' },
              media_type: { type: 'string' },
              service_version: { type: 'string' },
              title: { type: 'string' },
              url: { type: 'string', format: 'uri' }
            }
          }
        };
      }
    }
    
    return schema;
  }

  // Helper function to convert $ref from Swagger 2.0 to OpenAPI 3.0
  function convertRef(obj) {
    if (typeof obj === 'object' && obj !== null) {
      if (obj.$ref && obj.$ref.startsWith('#/definitions/')) {
        return {
          ...obj,
          $ref: obj.$ref.replace('#/definitions/', '#/components/schemas/')
        };
      }
      const converted = {};
      Object.keys(obj).forEach(key => {
        converted[key] = convertRef(obj[key]);
      });
      return converted;
    }
    return obj;
  }

  if (swagger2Data.paths) {
    Object.keys(swagger2Data.paths).forEach(pathKey => {
      const pathData = swagger2Data.paths[pathKey];
      const newPathData = {};

      Object.keys(pathData).forEach(method => {
        if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
          const operation = pathData[method];
          
          // Convert parameters
          const newOperation = {
            summary: operation.summary || `${method.toUpperCase()} ${pathKey}`,
            description: operation.description || operation.descriptions || `Access data from ${pathKey}`,
            tags: operation.tags || [],
            parameters: operation.parameters ? operation.parameters.map(param => {
              if (param.in === 'query' || param.in === 'header' || param.in === 'path') {
                const parameter = {
                  name: param.name,
                  in: param.in,
                  description: param.description,
                  required: param.in === 'path' ? true : (param.required || false),
                  schema: {
                    type: param.type || 'string'
                  }
                };
                
                // Handle format field or schema field being a format
                if (param.format && param.format !== 'undefined') {
                  parameter.schema.format = param.format;
                } else if (param.schema === 'date') {
                  parameter.schema.format = 'date';
                } else if (param.schema && typeof param.schema === 'object') {
                  parameter.schema = param.schema;
                }
                
                return parameter;
              }
              return param;
            }) : []
          };

          // Convert responses
          if (operation.responses) {
            newOperation.responses = {};
            Object.keys(operation.responses).forEach(statusCode => {
              const response = operation.responses[statusCode];
              newOperation.responses[statusCode] = {
                description: response.description || 'Response'
              };
              
              if (response.schema || statusCode === '200') {
                const schema = cleanSchema(convertRef(response.schema || { type: 'object' }));
                newOperation.responses[statusCode].content = {
                  'application/json': {
                    schema: schema
                  }
                };
              }
            });
          } else {
            // Add default responses if none exist
            newOperation.responses = {
              '200': {
                description: 'Successful response',
                content: {
                  'application/json': {
                    schema: { type: 'object' }
                  }
                }
              }
            };
          }

          // Handle security
          if (operation.security) {
            newOperation.security = operation.security;
          }

          newPathData[method] = newOperation;
        }
      });

      paths[pathKey] = newPathData;
    });
  }

  // Convert security definitions
  if (swagger2Data.securityDefinitions) {
    Object.keys(swagger2Data.securityDefinitions).forEach(key => {
      const secDef = swagger2Data.securityDefinitions[key];
      if (secDef.type === 'apiKey') {
        components.securitySchemes[key] = {
          type: 'apiKey',
          name: secDef.name,
          in: secDef.in
        };
      }
    });
  }

  // Convert definitions to schemas
  if (swagger2Data.definitions) {
    Object.keys(swagger2Data.definitions).forEach(key => {
      components.schemas[key] = convertRef(swagger2Data.definitions[key]);
    });
  }

  return { paths, components };
}

// Test an endpoint to verify it works and get response schema
async function testEndpoint(url, retries = 1) {
  try {
    console.log(`Testing endpoint: ${url}`);
    const response = await axios.get(url, {
      timeout: 5000,
      validateStatus: (status) => status < 500 // Accept 4xx as valid for API key issues
    });
    
    return {
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    if (retries > 0 && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      console.log(`Retrying endpoint ${url} (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return testEndpoint(url, retries - 1);
    }
    
    console.log(`⚠ Network error testing ${url}: ${error.message}`);
    return {
      status: error.response?.status || 500,
      error: error.message,
      data: error.response?.data,
      offline: true
    };
  }
}

// Infer schema from response data
function inferSchemaFromResponse(data) {
  if (data === null) return { type: 'null' };
  if (Array.isArray(data)) {
    if (data.length > 0) {
      return {
        type: 'array',
        items: inferSchemaFromResponse(data[0])
      };
    }
    return { type: 'array', items: { type: 'object' } };
  }
  
  const type = typeof data;
  if (type === 'object') {
    const properties = {};
    Object.keys(data).forEach(key => {
      properties[key] = inferSchemaFromResponse(data[key]);
    });
    return { type: 'object', properties };
  }
  
  if (type === 'string') {
    // Check if it's a date format
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { type: 'string', format: 'date' };
    }
    // Check if it's a URI
    if (/^https?:\/\//.test(data)) {
      return { type: 'string', format: 'uri' };
    }
    return { type: 'string' };
  }
  
  return { type };
}

// Parse parameter type from HTML table cell
function parseParameterType(typeText) {
  const text = typeText.toLowerCase().trim();
  if (text.includes('yyyy-mm-dd') || text === 'date') {
    return { type: 'string', format: 'date' };
  }
  if (text === 'int' || text === 'integer') {
    return { type: 'integer' };
  }
  if (text === 'bool' || text === 'boolean') {
    return { type: 'boolean' };
  }
  if (text === 'float' || text === 'number') {
    return { type: 'number' };
  }
  return { type: 'string' };
}

// Extract API endpoints from HTML template using proper parsing
async function extractEndpointsFromHTML(htmlTemplate, apiName) {
  console.log(`\nParsing HTML template for ${apiName}`);
  const $ = cheerio.load(htmlTemplate);
  const paths = {};
  const endpoints = [];

  // Extract endpoints from various patterns in the HTML
  const fullText = $.text();
  const codeElements = $('code').toArray();
  
  // Pattern 1: Direct URLs in text with various parameter formats
  const urlPatterns = [
    /GET\s+(https:\/\/api\.nasa\.gov[^\s<\)]+)/gi,
    /(https:\/\/api\.nasa\.gov[^\s"<>\)\?]+)/gi,
    /api\.nasa\.gov([^\s"<>\)\?]+)/gi
  ];

  // Pattern 2: Special handling for angle bracket parameters
  const paramPatterns = [
    /GET\s+https:\/\/api\.nasa\.gov([^\s<]+)\s*<([A-Z][^>]*ID[^>]*|[A-Z][^>]*[A-Z][^>]*)>/gi,
    /https:\/\/api\.nasa\.gov([^\s<]+)\s*<([A-Z][^>]*ID[^>]*|[A-Z][^>]*[A-Z][^>]*)>/gi
  ];

  // Extract from code elements first (higher priority)
  codeElements.forEach(element => {
    const codeText = $(element).text();
    
    // First check for parameterized patterns
    paramPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(codeText)) !== null) {
        let basePath = match[1];
        let paramName = match[2].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        
        if (basePath && !basePath.includes('DEMO_KEY')) {
          // Ensure proper path format
          if (!basePath.startsWith('/')) basePath = '/' + basePath;
          if (!basePath.endsWith('/')) basePath += '/';
          
          const path = basePath + '{' + paramName + '}';
          endpoints.push({ path, source: 'code', confidence: 'high' });
        }
      }
    });
    
    // Then check for regular URL patterns
    urlPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(codeText)) !== null) {
        let url = match[1] || match[0];
        if (url && !url.includes('DEMO_KEY') && !url.includes('YOUR_API_KEY')) {
          if (!url.startsWith('http')) {
            url = 'https://api.nasa.gov' + (url.startsWith('/') ? url : '/' + url);
          }
          const path = url.replace('https://api.nasa.gov', '').split('?')[0];
          if (path && path !== '/' && !path.includes('.html') && !path.includes('.png') && !path.includes('.jpg')) {
            // Only add if we haven't already found a parameterized version
            if (!endpoints.find(e => e.path.startsWith(path.split('/').slice(0, -1).join('/')) && e.path.includes('{'))) {
              endpoints.push({ path, source: 'code', confidence: 'high' });
            }
          }
        }
      }
    });
  });

  // Extract from full text (lower priority) - only nasa.gov URLs
  urlPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(fullText)) !== null) {
      let url = match[1] || match[0];
      if (url && !url.includes('DEMO_KEY') && !url.includes('YOUR_API_KEY') && 
          (url.includes('api.nasa.gov') || url.startsWith('/'))) {
        if (!url.startsWith('http')) {
          url = 'https://api.nasa.gov' + (url.startsWith('/') ? url : '/' + url);
        }
        const path = url.replace('https://api.nasa.gov', '').split('?')[0];
        if (path && path !== '/' && !path.includes('.html') && !path.includes('.png') && !path.includes('.jpg') &&
            path.includes('api.nasa.gov') === false) { // Exclude if it still contains api.nasa.gov (malformed)
          const existing = endpoints.find(e => e.path === path);
          if (!existing) {
            endpoints.push({ path, source: 'text', confidence: 'medium' });
          }
        }
      }
    }
  });

  // API-specific endpoint patterns (based on common NASA API structures)
  const apiPatterns = {
    'APOD': ['/planetary/apod'],
    'Asteroids NeoWs': ['/neo/rest/v1/feed', '/neo/rest/v1/neo/{asteroid_id}', '/neo/rest/v1/neo/browse'],
    'DONKI': ['/DONKI/CME', '/DONKI/CMEAnalysis', '/DONKI/GST', '/DONKI/IPS', '/DONKI/FLR', '/DONKI/SEP', '/DONKI/MPC', '/DONKI/RBE', '/DONKI/HSS', '/DONKI/WSAEnlilSimulations', '/DONKI/notifications'],
    'EPIC': ['/EPIC/api/natural', '/EPIC/api/natural/date/{date}', '/EPIC/api/natural/all', '/EPIC/api/enhanced', '/EPIC/api/enhanced/date/{date}', '/EPIC/api/enhanced/all'],
    'EONET': ['/EONET/api/v2.1/events', '/EONET/api/v2.1/categories', '/EONET/api/v2.1/layers'],
    'Mars Rover Photos': ['/mars-photos/api/v1/rovers/{rover}/photos', '/mars-photos/api/v1/rovers/{rover}/latest_photos', '/mars-photos/api/v1/rovers'],
    'Insight': ['/insight_weather/'],
    'NASA Image and Video Library': ['/search'],
    'TechTransfer': ['/techtransfer/patent/{patent_id}', '/techtransfer/patent', '/techtransfer/software/{software_id}', '/techtransfer/software'],
    'TLE API': ['/tle/{satellite_id}', '/tle'],
    'Exoplanet': ['/exoplanet/exoplanets', '/exoplanet/exomultpars'],
    'GIBS': ['/wmts-webmerc/1.0.0/WMTSCapabilities.xml', '/wmts-geo/1.0.0/WMTSCapabilities.xml']
  };

  // Add known patterns if no endpoints were found
  if (endpoints.length === 0 && apiPatterns[apiName]) {
    apiPatterns[apiName].forEach(path => {
      endpoints.push({ path, source: 'pattern', confidence: 'low' });
    });
  }

  // Deduplicate endpoints
  const uniqueEndpoints = [];
  endpoints.forEach(endpoint => {
    if (!uniqueEndpoints.find(e => e.path === endpoint.path)) {
      uniqueEndpoints.push(endpoint);
    }
  });

  console.log(`Found ${uniqueEndpoints.length} potential endpoints for ${apiName}:`);
  uniqueEndpoints.forEach(ep => console.log(`  ${ep.path} (${ep.confidence} confidence from ${ep.source})`));

  // Extract parameter tables
  const parametersByContext = {};
  const tables = $('table').toArray();

  tables.forEach((table, tableIndex) => {
    const $table = $(table);
    const headers = $table.find('thead tr th, tr:first-child th, tr:first-child td').toArray()
      .map(th => $(th).text().trim().toLowerCase());
    
    if (headers.some(h => h.includes('parameter')) && headers.some(h => h.includes('type') || h.includes('description'))) {
      console.log(`Found parameter table ${tableIndex + 1} with headers: ${headers.join(', ')}`);
      
      const rows = $table.find('tbody tr, tr').toArray().slice(headers.includes('parameter') ? 1 : 0);
      const parameters = [];
      
      rows.forEach(row => {
        const cells = $(row).find('td, th').toArray();
        if (cells.length >= 2) {
          const paramName = $(cells[0]).text().trim();
          const paramType = cells[1] ? $(cells[1]).text().trim() : '';
          const paramDefault = cells[2] ? $(cells[2]).text().trim() : '';
          const paramDesc = cells[3] ? $(cells[3]).text().trim() : 
                           cells[2] ? $(cells[2]).text().trim() : '';
          
          if (paramName && paramName !== 'Parameter' && paramName !== 'parameter' && paramName.length < 50) {
            const schema = parseParameterType(paramType);
            
            const parameter = {
              name: paramName,
              in: paramName === 'api_key' ? 'query' : 
                  (paramName.includes('_id') || paramName === 'asteroid_id' || paramName === 'rover' || 
                   paramName === 'satellite_id' || paramName === 'date') ? 'query' : 'query',
              description: paramDesc || `${paramName} parameter`,
              required: false,
              schema: schema
            };
            
            if (paramDefault && paramDefault !== 'none' && paramDefault !== '' && paramDefault !== 'null') {
              parameter.schema.default = paramDefault;
            }
            
            parameters.push(parameter);
          }
        }
      });
      
      // Associate parameters with context
      const prevHeading = $table.prevAll('h1, h2, h3, h4').first().text().trim();
      const nextHeading = $table.nextAll('h1, h2, h3, h4').first().text().trim();
      const context = prevHeading || nextHeading || `table_${tableIndex}`;
      parametersByContext[context] = parameters;
    }
  });

  // Process each endpoint
  for (const endpointInfo of uniqueEndpoints) {
    const { path, confidence } = endpointInfo;
    
    // Find the best parameter set for this endpoint
    let parameters = [];
    
    // Try to match parameters by context/heading
    const pathKeywords = path.toLowerCase().split('/').filter(p => p && !p.includes('{'));
    let bestMatch = null;
    let bestScore = 0;
    
    Object.keys(parametersByContext).forEach(context => {
      const contextKeywords = context.toLowerCase().split(/[\s-_]+/);
      const score = pathKeywords.reduce((acc, keyword) => {
        return acc + (contextKeywords.some(ck => ck.includes(keyword) || keyword.includes(ck)) ? 1 : 0);
      }, 0);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = context;
      }
    });
    
    if (bestMatch && parametersByContext[bestMatch]) {
      parameters = [...parametersByContext[bestMatch]];
    } else if (Object.keys(parametersByContext).length > 0) {
      // Use the first parameter set if no good match
      parameters = [...Object.values(parametersByContext)[0]];
    }

    // Always ensure api_key parameter
    if (!parameters.find(p => p.name === 'api_key')) {
      parameters.push({
        name: 'api_key',
        in: 'query',
        description: 'NASA API Key for expanded usage',
        required: false,
        schema: {
          type: 'string',
          default: 'DEMO_KEY'
        }
      });
    }

    // Handle path parameters
    const pathParams = [];
    const paramMatches = path.match(/\{([^}]+)\}/g);
    if (paramMatches) {
      paramMatches.forEach(match => {
        const paramName = match.slice(1, -1);
        // Remove from query parameters if it exists
        parameters = parameters.filter(p => p.name !== paramName);
        
        let paramType = 'string';
        let paramDesc = `The ${paramName} parameter`;
        
        // Improve parameter descriptions based on name
        if (paramName.includes('id')) {
          paramType = 'string';
          paramDesc = `The unique identifier for the ${paramName.replace('_id', '').replace('id', '')} resource`;
        } else if (paramName === 'date') {
          paramType = 'string';
          paramDesc = 'Date in YYYY-MM-DD format';
        } else if (paramName === 'rover') {
          paramType = 'string';
          paramDesc = 'Mars rover name (curiosity, opportunity, spirit)';
        } else if (paramName === 'satellite_id') {
          paramType = 'string';
          paramDesc = 'Satellite NORAD catalog number';
        }
        
        pathParams.push({
          name: paramName,
          in: 'path',
          description: paramDesc,
          required: true,
          schema: { type: paramType }
        });
      });
    }

    // Generate realistic response schema based on API type
    let responseSchema = { type: 'object' };
    if (apiName === 'APOD') {
      responseSchema = {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          explanation: { type: 'string' },
          hdurl: { type: 'string', format: 'uri' },
          media_type: { type: 'string' },
          service_version: { type: 'string' },
          title: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          copyright: { type: 'string' }
        }
      };
    } else if (apiName === 'Mars Rover Photos') {
      responseSchema = {
        type: 'object',
        properties: {
          photos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                sol: { type: 'integer' },
                camera: { type: 'object' },
                img_src: { type: 'string', format: 'uri' },
                earth_date: { type: 'string', format: 'date' },
                rover: { type: 'object' }
              }
            }
          }
        }
      };
    }

    // Extract description from context
    let description = `Access ${apiName} data`;
    const headings = $('h1, h2, h3, h4').toArray();
    for (const heading of headings) {
      const headingText = $(heading).text().toLowerCase();
      const pathWords = path.toLowerCase().split('/').filter(p => p && !p.includes('{'));
      
      if (pathWords.some(word => headingText.includes(word))) {
        const nextP = $(heading).nextAll('p').first();
        if (nextP.length) {
          description = nextP.text().trim().substring(0, 200) + (nextP.text().length > 200 ? '...' : '');
          break;
        }
      }
    }

    // Create path definition
    const pathData = {
      get: {
        tags: [apiName],
        summary: `${apiName} - ${path.split('/').pop() || 'API'}`,
        description: description,
        parameters: [...pathParams, ...parameters],
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: responseSchema
              }
            }
          },
          '400': {
            description: 'Bad request - invalid parameters'
          },
          '403': {
            description: 'Forbidden - invalid API key'
          },
          '429': {
            description: 'Too many requests - rate limit exceeded'
          }
        },
        security: [{ api_key: [] }]
      }
    };

    paths[path] = pathData;
  }

  console.log(`Generated ${Object.keys(paths).length} paths for ${apiName}\n`);
  return paths;
}

// Generate comprehensive OpenAPI 3.0+ specification
async function generateOpenAPISpec(apis) {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'NASA APIs',
      description: `This API provides access to NASA's collection of APIs for accessing space and earth science data. The APIs cover a wide range of NASA datasets including:\n\n- Astronomy Picture of the Day (APOD)\n- Near Earth Object Web Service (NeoWs)\n- Space Weather Database (DONKI)\n- Global Imagery Browse Services (GIBS)\n- Earth Observatory Natural Event Tracker (EONET)\n- Earth Polychromatic Imaging Camera (EPIC)\n- NASA Exoplanet Archive\n- Open Science Data Repository\n- TLE (Two Line Element) API\n- Trek WMTS Services\n\nMost APIs require an API key which can be obtained from https://api.nasa.gov/`,
      version: '1.0.0',
      contact: {
        name: 'NASA Open Data',
        url: 'https://api.nasa.gov/',
        email: 'hq-open-innovation@nasa.gov'
      },
      license: {
        name: 'NASA Open Data',
        url: 'https://www.nasa.gov/about/highlights/HP_Privacy.html'
      },
      termsOfService: 'https://www.nasa.gov/about/highlights/HP_Privacy.html'
    },
    servers: [
      {
        url: 'https://api.nasa.gov',
        description: 'NASA API Production Server'
      }
    ],
    security: [
      {
        api_key: []
      }
    ],
    paths: {},
    components: {
      securitySchemes: {
        api_key: {
          type: 'apiKey',
          name: 'api_key',
          in: 'query',
          description: 'NASA API Key. Get your key at https://api.nasa.gov/'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string'
                },
                message: {
                  type: 'string'
                }
              }
            }
          }
        }
      }
    },
    tags: []
  };

  // Process each API
  for (const api of apis) {
    // Add tag for this API
    openApiSpec.tags.push({
      name: api.name,
      description: api.summary
    });

    let apiPaths = {};

    // If API has existing swagger data, convert it
    if (api.swagger_data && api.swagger_data.paths) {
      console.log(`Converting existing Swagger 2.0 data for ${api.name}`);
      const converted = convertSwagger2ToOpenAPI3(api.swagger_data);
      apiPaths = converted.paths;
      
      // Merge security schemes
      if (converted.components.securitySchemes) {
        Object.assign(openApiSpec.components.securitySchemes, converted.components.securitySchemes);
      }
      
      // Merge schemas
      if (converted.components.schemas) {
        Object.assign(openApiSpec.components.schemas, converted.components.schemas);
      }
    } else {
      // Extract endpoints from HTML template
      console.log(`Extracting endpoints from HTML template for ${api.name}`);
      apiPaths = await extractEndpointsFromHTML(api.html_template, api.name);
    }

    // Add API-specific paths to the main spec
    Object.keys(apiPaths).forEach(pathKey => {
      const pathData = apiPaths[pathKey];
      
      // Ensure all operations have the API name as a tag
      Object.keys(pathData).forEach(method => {
        if (pathData[method] && typeof pathData[method] === 'object') {
          if (!pathData[method].tags) {
            pathData[method].tags = [];
          }
          if (!pathData[method].tags.includes(api.name)) {
            pathData[method].tags.push(api.name);
          }
        }
      });

      openApiSpec.paths[pathKey] = pathData;
    });
  }

  return openApiSpec;
}

// Convert JavaScript object to YAML string
function writeYamlFile(filePath, data) {
  const yamlString = yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false
  });
  fs.writeFileSync(filePath, yamlString);
}

// Main execution
async function main() {
  try {
    console.log('Loading NASA APIs from apis.json...');
    const apis = loadApis();
    console.log(`Found ${apis.length} APIs to process`);

    console.log('Generating OpenAPI 3.0+ specification...');
    const openApiSpec = await generateOpenAPISpec(apis);

    console.log('Converting to YAML format...');
    
    const outputPath = path.join(__dirname, 'openapi.yaml');
    writeYamlFile(outputPath, openApiSpec);

    console.log(`OpenAPI specification generated successfully: ${outputPath}`);
    console.log(`Total paths: ${Object.keys(openApiSpec.paths).length}`);
    console.log(`Total tags: ${openApiSpec.tags.length}`);
  } catch (error) {
    console.error('Error generating OpenAPI specification:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the generator
if (require.main === module) {
  main();
}

module.exports = { generateOpenAPISpec, loadApis };