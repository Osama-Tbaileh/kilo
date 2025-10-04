# GitHub Team Insights

A comprehensive analytics dashboard for GitHub teams that provides detailed insights into team performance, pull request metrics, and repository activity.

## Features

### Team Analytics
- **Developer Performance**: Lines added/removed, commits, PR activity
- **Code Review Metrics**: Reviews given/received, comment participation
- **Collaboration Insights**: Cross-team interactions and response times
- **Performance Rankings**: Leaderboards and comparative analysis

### Pull Request Analytics
- **Lifecycle Analysis**: PR duration, merge times, review cycles
- **Quality Metrics**: Review depth, comment engagement, approval patterns
- **Bottleneck Identification**: Stale PRs, review delays, merge conflicts
- **Trend Analysis**: Historical patterns and performance trends

### Repository Insights
- **Activity Heatmaps**: Contribution patterns across repositories
- **Health Scores**: Repository maintenance and activity levels
- **Cross-Repository Analysis**: Team collaboration patterns
- **Hotspot Detection**: High-activity areas and maintenance burden

## Tech Stack

- **Frontend**: React.js, Material-UI, Chart.js, Socket.IO
- **Backend**: Express.js, PostgreSQL, Redis, Socket.IO
- **APIs**: GitHub REST API, GitHub GraphQL API
- **Deployment**: Docker, Docker Compose

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Docker and Docker Compose (optional)
- GitHub Personal Access Token or GitHub App

### Installation

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd github-team-insights
   npm run install:all
   ```

2. **Environment Configuration**
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your configuration
   ```

3. **Database Setup**
   ```bash
   # Using Docker (recommended)
   docker-compose up -d postgres redis
   
   # Or install PostgreSQL and Redis locally
   npm run migrate
   ```

4. **Start Development**
   ```bash
   # Start both frontend and backend
   npm run dev
   
   # Or start individually
   npm run server:dev  # Backend on :5000
   npm run client:dev  # Frontend on :3000
   ```

### Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Configuration

### GitHub API Setup

1. **Personal Access Token** (Recommended for development)
   - Go to GitHub Settings > Developer settings > Personal access tokens
   - Generate token with `repo`, `read:org`, `read:user` scopes
   - Add to `GITHUB_PERSONAL_ACCESS_TOKEN` in `.env`

2. **GitHub App** (Recommended for production)
   - Create GitHub App in your organization
   - Install app on repositories
   - Configure app credentials in `.env`

### Environment Variables

```env
# Required
GITHUB_ORGANIZATION=your-org-name
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx
DB_HOST=localhost
DB_NAME=github_insights
DB_USER=postgres
DB_PASSWORD=password

# Optional
SYNC_INTERVAL_HOURS=6
HISTORICAL_DATA_MONTHS=12
RATE_LIMIT_MAX_REQUESTS=100
```

## API Endpoints

### Team Analytics
- `GET /api/team/overview` - Team performance summary
- `GET /api/team/members` - Team member list and stats
- `GET /api/team/rankings` - Performance rankings
- `GET /api/team/activity` - Activity timeline

### Pull Request Analytics
- `GET /api/prs/overview` - PR metrics overview
- `GET /api/prs/lifecycle` - PR lifecycle analysis
- `GET /api/prs/reviews` - Review metrics
- `GET /api/prs/stale` - Stale PR identification

### Repository Analytics
- `GET /api/repos/overview` - Repository summary
- `GET /api/repos/activity` - Repository activity
- `GET /api/repos/health` - Repository health scores

## Development

### Project Structure
```
github-team-insights/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom hooks
│   │   ├── services/      # API services
│   │   └── utils/         # Utilities
├── server/                # Express backend
│   ├── controllers/       # Route controllers
│   ├── models/           # Database models
│   ├── services/         # Business logic
│   ├── middleware/       # Express middleware
│   ├── routes/           # API routes
│   └── utils/            # Server utilities
└── docs/                 # Documentation
```

### Adding New Metrics

1. **Database**: Add new columns/tables in `server/models/`
2. **Data Collection**: Update GitHub API services in `server/services/github/`
3. **API**: Add endpoints in `server/routes/`
4. **Frontend**: Create components in `client/src/components/`

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the [documentation](docs/)
- Review the [FAQ](docs/FAQ.md)