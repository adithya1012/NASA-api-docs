#!/usr/bin/env node

/**
 * NASA APIs OpenAPI 3.0+ Generator
 * 
 * This script reads the NASA APIs metadata from apis.json and generates
 * a comprehensive OpenAPI 3.0+ specification covering all available APIs.
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

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

// Extract API endpoints from HTML template
function extractEndpointsFromHTML(htmlTemplate, apiName) {
  const paths = {};
  
  // Common patterns to extract API endpoints
  const patterns = [
    // Pattern: GET https://api.nasa.gov/path
    /GET\s+https:\/\/api\.nasa\.gov([^\s<]+)/gi,
    // Pattern: https://api.nasa.gov/path in links and code blocks
    /https:\/\/api\.nasa\.gov([^\s"<>]+)/gi
  ];

  const endpoints = new Set();
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(htmlTemplate)) !== null) {
      let endpoint = match[1];
      if (endpoint && !endpoint.includes('DEMO_KEY')) {
        // Clean up the endpoint
        endpoint = endpoint.split('?')[0]; // Remove query params
        endpoint = endpoint.replace(/&amp;/g, ''); // Remove HTML entities
        if (endpoint && endpoint !== '/' && !endpoint.includes('.html') && !endpoint.includes('.png') && !endpoint.includes('.jpg')) {
          endpoints.add(endpoint);
        }
      }
    }
  });

  // Add some known common NASA API patterns based on API names
  const apiSpecificEndpoints = {
    'Asteroids NeoWs': ['/neo/rest/v1/feed', '/neo/rest/v1/neo/{asteroid_id}', '/neo/rest/v1/neo/browse'],
    'DONKI': ['/DONKI/CME', '/DONKI/CMEAnalysis', '/DONKI/GST', '/DONKI/IPS', '/DONKI/FLR', '/DONKI/SEP', '/DONKI/MPC', '/DONKI/RBE', '/DONKI/HSS', '/DONKI/WSAEnlilSimulations', '/DONKI/notifications'],
    'EPIC': ['/EPIC/api/natural', '/EPIC/api/natural/date/{date}', '/EPIC/api/natural/all', '/EPIC/api/enhanced', '/EPIC/api/enhanced/date/{date}', '/EPIC/api/enhanced/all'],
    'EONET': ['/EONET/api/v2.1/events', '/EONET/api/v2.1/categories', '/EONET/api/v2.1/layers'],
    'Mars Rover Photos': ['/mars-photos/api/v1/rovers/{rover}/photos', '/mars-photos/api/v1/rovers/{rover}/latest_photos', '/mars-photos/api/v1/rovers'],
    'Insight': ['/insight_weather/'],
    'NASA Image and Video Library': ['/search'],
    'TechTransfer': ['/techtransfer'],
    'Satellite Situation Center': ['/sscweb/locations', '/sscweb/observatories'],
    'SSD/CNEOS': ['/ssd/fireball.api', '/ssd/sbdb_query.api'],
    'Open Science Data Repository': ['/techtransfer'],
    'TLE API': ['/tle/{satellite_id}', '/tle'],
    'Exoplanet': ['/exoplanet/exoplanets', '/exoplanet/exomultpars'],
    'GIBS': ['/wmts-webmerc/1.0.0/WMTSCapabilities.xml', '/wmts-geo/1.0.0/WMTSCapabilities.xml']
  };

  if (apiSpecificEndpoints[apiName]) {
    apiSpecificEndpoints[apiName].forEach(endpoint => endpoints.add(endpoint));
  }

  // Create basic path definitions for extracted endpoints
  endpoints.forEach(endpoint => {
    if (endpoint && endpoint !== '/') {
      const pathParams = [];
      let processedPath = endpoint;
      
      // Handle path parameters like {asteroid_id}
      const paramMatches = endpoint.match(/\{([^}]+)\}/g);
      if (paramMatches) {
        paramMatches.forEach(match => {
          const paramName = match.slice(1, -1);
          pathParams.push({
            name: paramName,
            in: 'path',
            description: `The ${paramName} parameter`,
            required: true,
            schema: {
              type: 'string'
            }
          });
        });
      }

      const parameters = [
        ...pathParams,
        {
          name: 'api_key',
          in: 'query',
          description: 'NASA API Key for expanded usage',
          required: false,
          schema: {
            type: 'string',
            default: 'DEMO_KEY'
          }
        }
      ];

      // Add API-specific parameters
      if (apiName === 'APOD') {
        parameters.push(
          {
            name: 'date',
            in: 'query',
            description: 'The date of the APOD image to retrieve (YYYY-MM-DD)',
            required: false,
            schema: {
              type: 'string',
              format: 'date'
            }
          },
          {
            name: 'start_date',
            in: 'query',
            description: 'The start of a date range (YYYY-MM-DD)',
            required: false,
            schema: {
              type: 'string',
              format: 'date'
            }
          },
          {
            name: 'end_date',
            in: 'query',
            description: 'The end of the date range (YYYY-MM-DD)',
            required: false,
            schema: {
              type: 'string',
              format: 'date'
            }
          },
          {
            name: 'count',
            in: 'query',
            description: 'Number of randomly chosen images to return',
            required: false,
            schema: {
              type: 'integer',
              minimum: 1,
              maximum: 100
            }
          },
          {
            name: 'thumbs',
            in: 'query',
            description: 'Return the URL of video thumbnail',
            required: false,
            schema: {
              type: 'boolean'
            }
          }
        );
      }

      paths[processedPath] = {
        get: {
          tags: [apiName],
          summary: `${apiName} endpoint`,
          description: `Access ${apiName} data`,
          parameters: parameters,
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    description: `Response data for ${apiName}`
                  }
                }
              }
            },
            '400': {
              description: 'Bad request - invalid parameters',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error'
                  }
                }
              }
            },
            '403': {
              description: 'Forbidden - invalid API key',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error'
                  }
                }
              }
            },
            '429': {
              description: 'Too many requests - rate limit exceeded',
              content: {
                'application/json': {
                  schema: {
                    '$ref': '#/components/schemas/Error'
                  }
                }
              }
            }
          }
        }
      };
    }
  });

  return paths;
}

// Generate comprehensive OpenAPI 3.0+ specification
function generateOpenAPISpec(apis) {
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
  apis.forEach(api => {
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
      apiPaths = extractEndpointsFromHTML(api.html_template, api.name);
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
  });

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
function main() {
  try {
    console.log('Loading NASA APIs from apis.json...');
    const apis = loadApis();
    console.log(`Found ${apis.length} APIs to process`);

    console.log('Generating OpenAPI 3.0+ specification...');
    const openApiSpec = generateOpenAPISpec(apis);

    console.log('Converting to YAML format...');
    
    const outputPath = path.join(__dirname, 'openapi.yaml');
    writeYamlFile(outputPath, openApiSpec);

    console.log(`OpenAPI specification generated successfully: ${outputPath}`);
    console.log(`Total paths: ${Object.keys(openApiSpec.paths).length}`);
    console.log(`Total tags: ${openApiSpec.tags.length}`);
  } catch (error) {
    console.error('Error generating OpenAPI specification:', error.message);
    process.exit(1);
  }
}

// Run the generator
if (require.main === module) {
  main();
}

module.exports = { generateOpenAPISpec, loadApis };