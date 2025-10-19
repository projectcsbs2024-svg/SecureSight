import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import { OpenStreetMapProvider } from "leaflet-geosearch";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const provider = new OpenStreetMapProvider();

export const MapPicker = ({ latitude, longitude, onLocationChange }) => {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [markerKey, setMarkerKey] = useState(0);
  const mapRef = useRef();

  // Debounce search input
  useEffect(() => {
    if (!search) {
      setSuggestions([]);
      return;
    }

    const timeout = setTimeout(async () => {
      const results = await provider.search({ query: search });
      setSuggestions(results.slice(0, 5));
    }, 300);

    return () => clearTimeout(timeout);
  }, [search]);

  const handleSelect = (lat, lng, label) => {
    onLocationChange(lat, lng, label);
    setSearch(label);
    setShowSuggestions(false);

    // Fly to selected location
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 16, { duration: 1.5 });
    }

    // Trigger marker "bounce"
    setMarkerKey((prev) => prev + 1);
  };

  const LocationMarker = () => {
    const map = useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        reverseGeocode(lat, lng);
      },
    });
    mapRef.current = map;

    const reverseGeocode = async (lat, lng) => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
        );
        const data = await res.json();
        onLocationChange(lat, lng, data.display_name);
      } catch {
        onLocationChange(lat, lng, `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`);
      }
    };

    return latitude && longitude ? (
      <Marker
        key={markerKey}
        position={[latitude, longitude]}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const pos = e.target.getLatLng();
            reverseGeocode(pos.lat, pos.lng);
          },
        }}
      />
    ) : null;
  };

  return (
    <div className="w-full relative">
      {/* Search Box */}
      <div className="relative w-full max-w-md mx-auto mb-2">
        <input
          type="text"
          placeholder="Search location..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          className="w-full bg-gray-800 text-white p-2 rounded-md border border-gray-700 outline-none"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute top-full left-0 w-full bg-gray-900 text-white rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto z-[1000]">
            {suggestions.map((s, i) => (
              <li
                key={i}
                className="px-2 py-1 cursor-pointer hover:bg-gray-700"
                onClick={() => handleSelect(s.y, s.x, s.label)}
              >
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Map */}
      <div className="pb-2"> {/* ✅ Added small padding-bottom for visual spacing */}
        <MapContainer
          center={[latitude || 0, longitude || 0]}
          zoom={latitude && longitude ? 13 : 2}
          scrollWheelZoom={true}
          style={{ height: "300px", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
          />
          <LocationMarker />
        </MapContainer>
      </div>
    </div>
  );
};
