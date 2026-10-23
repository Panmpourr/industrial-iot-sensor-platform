import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

interface LocationMapProps {
    latitude: number;
    longitude: number;
    color: string;
    name: string;
    valueText: string;
}

/** OpenStreetMap with the sensor as a marker in its status colour. Loaded only when a sensor has a location. */
const LocationMap = ({ latitude, longitude, color, name, valueText }: LocationMapProps) => (
    <MapContainer center={[latitude, longitude]} zoom={13} style={{ height: '100%', width: '100%', borderRadius: 4 }}>
        <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            className="map-tiles-dark"
        />
        <CircleMarker center={[latitude, longitude]} radius={9} pathOptions={{ color, fillColor: color, fillOpacity: 0.6 }}>
            <Popup>
                <b>{name}</b><br />{valueText}
            </Popup>
        </CircleMarker>
    </MapContainer>
);

export default LocationMap;
