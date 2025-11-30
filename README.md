# Qonnect

<p align="center">
  <img src="resources/icons/database.svg" width="100" height="100" alt="Qonnect Logo">
</p>

<p align="center">
  <strong>A professional, open-source database client for VS Code with AI features and Docker integration</strong>
</p>

<p align="center">
  <a href="https://qonnect.platformengr.com">Documentation</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#ai-integration">AI Integration</a> •
  <a href="#docker-integration">Docker</a> •
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <a href="https://github.com/platformengr/qonnect">GitHub</a> •
  <a href="https://www.platformengr.com">PlatformEngr</a>
</p>

---

## Features

### 🔌 Multi-Database Support
Connect to multiple databases simultaneously:
- ✅ **PostgreSQL** (fully implemented)
- 🔜 MySQL (coming soon)
- 🔜 MongoDB (coming soon)
- 🔜 Redis (coming soon)
- 🔜 SQLite (coming soon)

### 📁 Connection Management
- Save and organize connections in the sidebar
- Group connections into categories (folders)
- Secure password storage using VS Code's secrets API
- Test connections before saving

### 📊 Data Viewer
- Browse database schemas, tables, views, and functions
- View table data with pagination, sorting, and filtering
- See column types, primary keys, and foreign key relationships
- Visual query results with export options

### ✏️ Query Editor
- Execute SQL queries with syntax highlighting
- View results in a professional data grid
- Keyboard shortcuts (Ctrl+Enter to run)
- Query execution time and row count

### 🐳 Docker Integration
- Create database containers with one click
- Start/stop existing containers
- Preconfigured templates for popular databases
- Automatic port mapping and environment setup

### 🤖 AI/Copilot Integration
Interact with your databases using natural language through GitHub Copilot:
- Execute queries
- List and describe tables
- Manage Docker containers
- Get schema information

---

## Installation

### Prerequisites
- VS Code 1.85.0 or higher
- Node.js 18+ (for development)
- Docker (optional, for container features)

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/platformengr/qonnect.git
   cd qonnect
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Compile the extension**
   ```bash
   npm run compile
   ```

4. **Run in development mode**
   - Open the project in VS Code
   - Press `F5` to launch the Extension Development Host
   - The extension will be active in the new VS Code window

### Building for Production

```bash
# Create production bundle
npm run package

# Create VSIX file for distribution
npx vsce package
```

---

## Quick Start

### 1. Add a Connection

1. Click the database icon in the Activity Bar
2. Click the **+** button in the Connections view
3. Select **PostgreSQL** as the database type
4. Fill in your connection details:
   - **Name**: A friendly name for the connection
   - **Host**: Database server address (e.g., `localhost`)
   - **Port**: Database port (default: `5432`)
   - **Database**: Database name
   - **Username**: Database user
   - **Password**: Database password
5. Click **Test Connection** to verify
6. Click **Save Connection**

### 2. Browse Database

1. Click on a saved connection in the sidebar
2. Click the plug icon to connect
3. Expand the connection to see:
   - Tables
   - Views
   - Functions
4. Click on a table to see its columns
5. Right-click on a table and select **View Data**

### 3. Run Queries

1. Right-click on a connection and select **New Query**
2. Write your SQL query
3. Press `Ctrl+Enter` or click **Run Query**
4. View results in the data grid below

---

## AI Integration

Qonnect integrates with GitHub Copilot, allowing you to interact with your databases using natural language.

### Available Copilot Tools

| Tool | Description |
|------|-------------|
| `database_query` | Execute SQL queries |
| `database_list_tables` | List all tables in the database |
| `database_describe_table` | Get detailed table schema |
| `database_list_connections` | List saved connections |
| `docker_database_start` | Start a database container |
| `docker_database_stop` | Stop a database container |

### Usage Examples

In GitHub Copilot Chat:

```
@qonnect Show me all users who signed up this month
```

```
@qonnect What's the schema of the orders table?
```

```
@qonnect Start a PostgreSQL container for development
```

---

## Docker Integration

### Create a Database Container

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run `Qonnect: Create Database Container`
3. Select database type (PostgreSQL, MySQL, MongoDB, Redis)
4. Enter container name and password
5. The container will be created and started automatically

### Manage Containers

- **Start**: `Qonnect: Start Database Container`
- **Stop**: `Qonnect: Stop Database Container`

### Default Database Templates

| Database | Image | Default Port |
|----------|-------|--------------|
| PostgreSQL | `postgres:16-alpine` | 5432 |
| MySQL | `mysql:8` | 3306 |
| MongoDB | `mongo:7` | 27017 |
| Redis | `redis:7-alpine` | 6379 |

---

## Commands

| Command | Description |
|---------|-------------|
| `Qonnect: Add Connection` | Add a new database connection |
| `Qonnect: Refresh Connections` | Refresh the connections tree |
| `Qonnect: Edit Connection` | Edit an existing connection |
| `Qonnect: Delete Connection` | Delete a connection |
| `Qonnect: Connect` | Connect to a database |
| `Qonnect: Disconnect` | Disconnect from a database |
| `Qonnect: New Query` | Open query editor |
| `Qonnect: Run Query` | Execute current query |
| `Qonnect: View Data` | View table data |
| `Qonnect: Create Category` | Create a connection category |
| `Qonnect: Create Database Container` | Create a Docker container |
| `Qonnect: Start Database Container` | Start a container |
| `Qonnect: Stop Database Container` | Stop a container |

---

## Roadmap

### Phase 1: Core Features ✅
- [x] PostgreSQL support
- [x] Connection management
- [x] Tree view sidebar
- [x] Query editor
- [x] Table data viewer
- [x] Docker integration
- [x] Copilot tools

### Phase 2: Additional Databases
- [ ] MySQL support
- [ ] MongoDB support
- [ ] Redis support
- [ ] SQLite support
- [ ] SQL Server support

### Phase 3: Enhanced Features
- [ ] Query history
- [ ] Saved queries
- [ ] Data export (CSV, JSON, SQL)
- [ ] Table creation wizard
- [ ] Schema diff tool
- [ ] ER diagram viewer
- [ ] Query auto-complete
- [ ] Query formatting
- [ ] Dark/light theme support

### Phase 4: Advanced Features
- [ ] SSH tunnel support
- [ ] Query snippets
- [ ] Batch query execution
- [ ] Query explain/analyze
- [ ] Index suggestions
- [ ] Performance monitoring
- [ ] Database backup/restore
- [ ] Multi-tab query editor

### Phase 5: Collaboration
- [ ] Share connections via settings sync
- [ ] Team connection templates
- [ ] Query sharing

---

## Development

### Project Structure

```
src/
├── extension.ts          # Main entry point
├── types/                # Type definitions
│   ├── database.ts       # Database types
│   └── docker.ts         # Docker types
├── core/                 # Core business logic
│   ├── interfaces/       # Interface definitions
│   ├── clients/          # Database client implementations
│   └── services/         # Core services
├── adapters/
│   └── vscode/           # VS Code specific adapters
│       ├── ConnectionTreeDataProvider.ts
│       ├── QueryEditorPanel.ts
│       ├── TableViewerPanel.ts
│       └── ConnectionFormPanel.ts
└── features/
    └── copilot/          # Copilot integration
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test -- --coverage

# Run tests in watch mode
npm run test:watch
```

### Code Style

This project follows:
- TypeScript strict mode
- SOLID principles
- Clean architecture
- 80% minimum test coverage

See `copilot-instructions.md` for detailed coding guidelines.

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## License

MIT License - Copyright (c) 2024 [PlatformEngr](https://www.platformengr.com)

See [LICENSE](LICENSE) for details.

---

## Links

- 📖 [Documentation](https://qonnect.platformengr.com)
- 🐙 [GitHub Repository](https://github.com/platformengr/qonnect)
- 🌐 [PlatformEngr](https://www.platformengr.com)

---

## Acknowledgments

- Built with ❤️ by [PlatformEngr](https://www.platformengr.com)
- Powered by GitHub Copilot AI features
