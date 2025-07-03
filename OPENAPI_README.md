# NASA APIs OpenAPI Specification

This repository contains a comprehensive OpenAPI 3.0+ specification for NASA's public APIs, generated from the metadata in `assets/json/apis.json`.

## 📁 Files

- **`openapi.yaml`** - The main OpenAPI 3.0.3 specification in YAML format
- **`openapi.json`** - The same specification in JSON format  
- **`swagger-ui.html`** - A local Swagger UI viewer for the specification
- **`generate-openapi.js`** - Script to generate the OpenAPI spec from apis.json
- **`validate-openapi.js`** - Script to validate the OpenAPI specification
- **`convert-to-json.js`** - Script to convert YAML to JSON format

## 🚀 Features

### Comprehensive API Coverage
The specification includes **76 endpoints** across **17 NASA APIs**:

- **APOD** - Astronomy Picture of the Day
- **Asteroids NeoWs** - Near Earth Object Web Service  
- **DONKI** - Space Weather Database
- **GIBS** - Global Imagery Browse Services
- **EONET** - Earth Observatory Natural Event Tracker
- **EPIC** - Earth Polychromatic Imaging Camera
- **Exoplanet** - NASA Exoplanet Archive
- **Mars Rover Photos** - Mars rover image data
- **NASA Image and Video Library** - Images and videos
- **TechTransfer** - Patents and technology transfer
- **Techport** - NASA technology projects
- **TLE API** - Two Line Element data
- **Trek WMTS** - Planetary mapping services
- And more...

### OpenAPI 3.0+ Compliance
- ✅ Validates against OpenAPI 3.0.3 specification
- ✅ Proper authentication scheme (NASA API key)
- ✅ Comprehensive response schemas
- ✅ Detailed parameter descriptions
- ✅ Organized with tags for easy navigation
- ✅ Error response handling (400, 403, 429)

### Authentication
All APIs use NASA's standard API key authentication:
```yaml
security:
  - api_key: []
```

Get your NASA API key at: https://api.nasa.gov/

## 🔧 Usage

### View in Swagger UI
1. Open `swagger-ui.html` in a web browser
2. Or use any online Swagger Editor with the `openapi.yaml` file
3. Or visit: https://editor.swagger.io/ and import the specification

### Integrate with Tools
- **Postman**: Import `openapi.json` to create a collection
- **Insomnia**: Import `openapi.yaml` for API testing
- **Code Generation**: Use with OpenAPI generators for SDKs
- **API Documentation**: Generate docs with tools like Redoc

### Example API Calls

#### Astronomy Picture of the Day
```bash
curl "https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY"
```

#### Near Earth Objects
```bash
curl "https://api.nasa.gov/neo/rest/v1/feed?start_date=2023-01-01&end_date=2023-01-07&api_key=DEMO_KEY"
```

#### Mars Rover Photos
```bash
curl "https://api.nasa.gov/mars-photos/api/v1/rovers/curiosity/photos?sol=1000&api_key=DEMO_KEY"
```

## 🛠️ Development

### Regenerate Specification
```bash
node generate-openapi.js
```

### Validate Specification  
```bash
node validate-openapi.js
```

### Convert to JSON
```bash
node convert-to-json.js
```

### Install Dependencies
```bash
npm install
```

## 📊 Specification Statistics

- **OpenAPI Version**: 3.0.3
- **Total APIs**: 17
- **Total Endpoints**: 76
- **HTTP Methods**: GET (primary)
- **Authentication**: API Key
- **Response Format**: JSON
- **File Size**: ~147 KB (JSON), ~95 KB (YAML)

## 🔍 Validation

The specification has been validated using:
- `swagger-parser` - OpenAPI/Swagger parser and validator
- `@apidevtools/swagger-parser` - Additional validation
- Manual testing with Swagger UI
- Schema compliance checks

## 📚 API Documentation

For detailed information about each API, see:
- [NASA API Portal](https://api.nasa.gov/)
- Individual API documentation linked in the OpenAPI spec
- The original `assets/json/apis.json` metadata file

## 🤝 Contributing

To add new APIs or update existing ones:
1. Update `assets/json/apis.json` with new API metadata
2. Run `node generate-openapi.js` to regenerate the specification
3. Validate with `node validate-openapi.js`
4. Test the updated specification

## 📄 License

This specification is derived from NASA's public API metadata and follows NASA's open data policies.

---

Generated from NASA API metadata on: $(date)
OpenAPI Specification Version: 3.0.3