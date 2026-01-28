# FiftyFive Labs

Professional AI Image Generation Platform with admin panel, user management, API keys, and rate limiting.

![FiftyFive Labs](https://via.placeholder.com/800x400/000/fff?text=FiftyFive+Labs)

## Features

- 🎨 **AI Image Generation** - FLUX, Stable Diffusion XL and more
- 👥 **User Management** - Registration, authentication, credit system
- 🔑 **API Keys** - User API keys for programmatic access
- 🛡️ **Admin Panel** - Full control over users, credits, and API keys
- ⚡ **Rate Limiting** - Hourly limits with automatic reset
- 🔄 **Concurrent Limits** - Per-user and per-API-key concurrent generation limits
- 📊 **Statistics** - Real-time usage metrics and analytics
- 🎯 **Credit System** - Flexible credit-based billing

## Quick Start

### Prerequisites

- Docker & Docker Compose
- OR Node.js 18+ and Python 3.11+

### Deploy with Docker

```bash
# Clone the repository
git clone https://github.com/yourusername/fiftyfive-labs.git
cd fiftyfive-labs

# Copy environment file
cp .env.example .env

# Edit .env with your settings
nano .env

# Start the service
docker-compose up -d
```

### Deploy to Render

1. Fork this repository
2. Create a new Web Service on Render
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml`
5. Set environment variables in Render dashboard:
   - `ADMIN_TOKEN` - Secure admin password
   - `IMAGE_API_KEY` - Together AI API key

### Manual Development Setup

```bash
# Install frontend dependencies
npm install

# Start frontend dev server
npm run dev

# In another terminal, start backend
pip install -r requirements.txt
python -m uvicorn server.main:app --reload
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_TOKEN` | Admin panel access token | Required |
| `IMAGE_API_URL` | Image generation API URL | Together AI |
| `IMAGE_API_KEY` | API key for image generation | Required |
| `DEFAULT_HOURLY_LIMIT` | Images per hour per API key | 2000 |
| `DEFAULT_CONCURRENT_LIMIT` | Concurrent gens per user | 3 |
| `MAX_CONCURRENT_PER_KEY` | Concurrent gens per API key | 10 |

## Admin Panel

Access admin panel by:
1. Create a user account
2. Access the database and set `is_admin = 1` for your user
3. Refresh the page to see "Admin" tab

### Admin Features

- **Dashboard** - View statistics and metrics
- **Users** - Search, edit credits, toggle access
- **API Keys** - Add/remove image generation API keys with limits

### Rate Limiting System

The platform includes a sophisticated rate limiting system:

- **Hourly Limits**: Each API key has a configurable hourly limit (e.g., 2000 images/hour)
- **Automatic Reset**: Limits reset at the top of each hour
- **Concurrent Limits**: 
  - Per-user limit (default: 3 simultaneous generations)
  - Per-API-key limit (default: 10 simultaneous generations)
- **Round-robin**: API keys are used in rotation to distribute load

## API Documentation

### Authentication

```bash
# Register
curl -X POST /api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"nickname": "user", "password": "pass123"}'

# Login
curl -X POST /api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nickname": "user", "password": "pass123"}'
```

### Generate Image

```bash
curl -X POST /api/generate \
  -H "X-Api-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful sunset over mountains",
    "model": "black-forest-labs/FLUX.1-schnell-Free",
    "width": 1024,
    "height": 1024
  }'
```

### Check Job Status

```bash
curl /api/jobs/{job_id} \
  -H "X-Api-Key: YOUR_API_KEY"
```

### Download Image

```bash
curl /api/jobs/{job_id}/image \
  -H "X-Api-Key: YOUR_API_KEY" \
  -o image.png
```

## Models

| Model | Description |
|-------|-------------|
| `black-forest-labs/FLUX.1-schnell-Free` | Fast, high-quality (default) |
| `black-forest-labs/FLUX.1.1-pro` | Professional quality |
| `stabilityai/stable-diffusion-xl-base-1.0` | Classic SDXL |

## Tech Stack

- **Frontend**: React 18, Tailwind CSS, Lucide Icons
- **Backend**: Python, FastAPI, SQLite
- **Deployment**: Docker, Render.com

## License

MIT License - feel free to use for personal and commercial projects.

## Support

For issues and feature requests, please open a GitHub issue.
