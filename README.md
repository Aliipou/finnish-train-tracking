# Finnish Train Tracker

A web application that displays real-time locations of trains in Finland on an interactive map using data from the Digitraffic API.

![Finnish Train Tracker Demo](screenshots/app-screenshot.png)

## Features

- **Real-time Train Tracking**: Fetches and displays the current locations of all active trains in Finland
- **Interactive Map**: Shows train positions on an interactive map of Finland
- **Train Type Identification**: Color-coded markers based on train types (Intercity, commuter, cargo, etc.)
- **Detailed Information**: Click on any train to view detailed information including:
  - Train number and type
  - Current speed
  - Origin and destination stations
  - Train category
  - Commuter line ID (if applicable)
- **Automatic Updates**: Configurable refresh rate (5 seconds to 1 minute)
- **Responsive Design**: Works on both desktop and mobile devices

## Technologies Used

- **Frontend**:
  - React.js - Frontend framework
  - Mapbox GL JS - Interactive mapping library
  - Axios - HTTP client for API requests
  
- **APIs**:
  - Digitraffic Train API - For real-time train location data
  - Mapbox API - For map rendering

- **Development Tools**:
  - Create React App - Project bootstrapping
  - Git/GitHub - Version control
  - npm - Package management

## Installation and Setup

### Prerequisites
- Node.js (v14 or newer)
- npm or yarn
- Mapbox API key

### Installation Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/finnish-train-tracker.git
   cd finnish-train-tracker