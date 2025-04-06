import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// This would typically be in a .env file and not exposed in the code
// Replace with your own Mapbox token
// IMPORTANT: In a real application, always use environment variables
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_TOKEN;

// Digitraffic doesn't require an API key, but we still need to set up proper headers
const DIGITRAFFIC_API_URL =
  "https://rata.digitraffic.fi/api/v1/train-locations/latest";

// Main Train Tracker Component
function App() {
  const [trains, setTrains] = useState([]);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshRate, setRefreshRate] = useState(10); // Default refresh rate in seconds

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});

  // Initialize map when component mounts
  useEffect(() => {
    mapboxgl.accessToken = MAPBOX_TOKEN;

    // Create the map centered on Finland
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v11",
      center: [25.7482, 62.2426], // Center of Finland
      zoom: 5,
    });

    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    // Save map instance to ref
    mapRef.current = map;

    // Cleanup on unmount
    return () => map.remove();
  }, []);

  // Function to fetch train locations
  const fetchTrainLocations = async () => {
    try {
      setLoading(true);
      const response = await axios.get(DIGITRAFFIC_API_URL, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      setTrains(response.data);
      setLoading(false);
      return response.data;
    } catch (err) {
      setError(`Failed to fetch train data: ${err.message}`);
      setLoading(false);
      return [];
    }
  };

  // Function to fetch additional train information
  const fetchTrainInfo = async (trainNumber) => {
    try {
      const response = await axios.get(
        `https://rata.digitraffic.fi/api/v1/trains/latest/${trainNumber}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );
      return response.data[0]; // Return the first train object
    } catch (err) {
      console.error(
        `Failed to fetch info for train ${trainNumber}: ${err.message}`
      );
      return null;
    }
  };

  // Update markers on the map
  const updateMarkers = async (trainData) => {
    const map = mapRef.current;

    if (!map || !trainData) return;

    // Remove old markers that are no longer in the data
    const currentTrainIds = new Set(
      trainData.map((train) => train.trainNumber.toString())
    );
    Object.keys(markersRef.current).forEach((trainId) => {
      if (!currentTrainIds.has(trainId)) {
        markersRef.current[trainId].remove();
        delete markersRef.current[trainId];
      }
    });

    // Add or update markers
    for (const train of trainData) {
      const id = train.trainNumber.toString();
      const { location } = train;

      // Skip if no location data
      if (!location || !location.coordinates) continue;

      // GeoJSON format is [longitude, latitude]
      const [longitude, latitude] = location.coordinates;

      // Train type and number for the label
      const label = `${train.trainType}${train.trainNumber}`;

      // If marker already exists, update its position
      if (markersRef.current[id]) {
        markersRef.current[id].setLngLat([longitude, latitude]);
      } else {
        // Create a new marker element
        const el = document.createElement("div");
        el.className = "train-marker";
        el.textContent = label;

        // Color the marker based on train type
        if (train.trainType === "IC" || train.trainType === "S") {
          el.classList.add("intercity-train");
        } else if (train.trainType === "P") {
          el.classList.add("passenger-train");
        } else if (
          train.trainType === "K" ||
          train.trainType === "L" ||
          train.trainType === "E" ||
          train.trainType === "Y"
        ) {
          el.classList.add("commuter-train");
        } else {
          el.classList.add("cargo-train");
        }

        // Create and save the marker
        const marker = new mapboxgl.Marker(el)
          .setLngLat([longitude, latitude])
          .addTo(map);

        // Add click handler to show train details
        marker.getElement().addEventListener("click", async () => {
          // Get detailed train info
          const trainInfo = await fetchTrainInfo(train.trainNumber);
          setSelectedTrain({ ...train, details: trainInfo });
        });

        markersRef.current[id] = marker;
      }
    }
  };

  // Fetch data and update markers on initial load
  useEffect(() => {
    const initialLoad = async () => {
      const data = await fetchTrainLocations();
      updateMarkers(data);
    };

    initialLoad();
  }, []);

  // Set up automatic refresh
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const data = await fetchTrainLocations();
      updateMarkers(data);
    }, refreshRate * 1000);

    // Cleanup interval on component unmount or refresh rate change
    return () => clearInterval(refreshInterval);
  }, [refreshRate]);

  // Close the selected train info panel
  const closeTrainInfo = () => {
    setSelectedTrain(null);
  };

  // Update refresh rate
  const handleRefreshRateChange = (e) => {
    const newRate = parseInt(e.target.value, 10);
    setRefreshRate(newRate);
  };

  return (
    <div className="train-tracker-container">
      <header className="app-header">
        <h1>Finnish Train Tracker</h1>
        <div className="controls">
          <label htmlFor="refresh-rate">
            Refresh every:
            <select
              id="refresh-rate"
              value={refreshRate}
              onChange={handleRefreshRateChange}
            >
              <option value="5">5 seconds</option>
              <option value="10">10 seconds</option>
              <option value="30">30 seconds</option>
              <option value="60">1 minute</option>
            </select>
          </label>
          <button onClick={fetchTrainLocations} disabled={loading}>
            {loading ? "Loading..." : "Refresh Now"}
          </button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="map-container" ref={mapContainerRef}>
        {loading && (
          <div className="loading-overlay">Loading train data...</div>
        )}
      </div>

      {selectedTrain && (
        <div className="train-info-panel">
          <button className="close-button" onClick={closeTrainInfo}>
            ×
          </button>
          <h2>
            Train {selectedTrain.trainType}
            {selectedTrain.trainNumber}
          </h2>
          <div className="train-details">
            <p>
              <strong>Speed:</strong> {selectedTrain.speed} km/h
            </p>
            <p>
              <strong>Location:</strong>{" "}
              {selectedTrain.location
                ? `${selectedTrain.location.coordinates[1].toFixed(
                    5
                  )}, ${selectedTrain.location.coordinates[0].toFixed(5)}`
                : "Not available"}
            </p>

            {selectedTrain.details && (
              <>
                <p>
                  <strong>Origin:</strong>{" "}
                  {selectedTrain.details.timeTableRows?.[0]?.stationShortCode ||
                    "N/A"}
                </p>
                <p>
                  <strong>Destination:</strong>{" "}
                  {selectedTrain.details.timeTableRows?.[
                    selectedTrain.details.timeTableRows.length - 1
                  ]?.stationShortCode || "N/A"}
                </p>
                <p>
                  <strong>Category:</strong>{" "}
                  {selectedTrain.details.trainCategory || "Unknown"}
                </p>
                <p>
                  <strong>Train Type:</strong>{" "}
                  {selectedTrain.details.trainType || "Unknown"}
                </p>
                {selectedTrain.details.commuterLineID && (
                  <p>
                    <strong>Commuter Line:</strong>{" "}
                    {selectedTrain.details.commuterLineID}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <p>
          Data provided by{" "}
          <a
            href="https://www.digitraffic.fi/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Digitraffic
          </a>
        </p>
        <p>Total trains visible: {trains.length}</p>
      </footer>
    </div>
  );
}

export default App;
