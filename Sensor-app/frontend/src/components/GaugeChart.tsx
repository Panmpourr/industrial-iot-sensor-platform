import { useState, useEffect, useRef, useCallback } from 'react';
import type { Status } from '../types';
import './GaugeChart.css';

export interface GaugeThreshold {
    warning: number;
    critical: number;
}

export interface GaugeChartProps {
    value: number;
    min: number;
    max: number;
    threshold: GaugeThreshold;
    title: string;
    unit: string;
}

const GaugeChart = ({ value, min, max, threshold, title, unit }: GaugeChartProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Clamp so values outside min..max still draw a sensible arc
    const normalizedValue = Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100);

    const getColor = useCallback(() => {
        if (value >= threshold.critical) return '#dc3545';
        if (value >= threshold.warning) return '#ffc107';
        return '#28a745';
    }, [value, threshold.critical, threshold.warning]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;

        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) * 0.8;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background arc
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25, false);
        ctx.lineWidth = 20;
        ctx.strokeStyle = '#eee';
        ctx.stroke();

        // Draw value arc
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius,
            Math.PI * 0.75,
            Math.PI * 0.75 + (Math.PI * 1.5 * normalizedValue / 100),
            false);
        ctx.lineWidth = 20;
        ctx.strokeStyle = getColor();
        ctx.stroke();

        // Draw value text
        ctx.font = '20px Arial';
        ctx.fillStyle = getColor();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${value.toFixed(1)}${unit}`, centerX, centerY);
    }, [value, min, max, getColor, normalizedValue, unit]);

    return (
        <div className="gauge-container">
            <h4 className="gauge-title">{title}</h4>
            <div style={{ width: '200px', height: '200px', margin: '0 auto' }}>
                <canvas ref={canvasRef} width="200" height="200" />
            </div>
            <div className="threshold-indicator">
                <div className="threshold-legend">
                    <span className="threshold-marker green"></span>
                    <span>Normal (below {threshold.warning}{unit})</span>
                </div>
                <div className="threshold-legend">
                    <span className="threshold-marker yellow"></span>
                    <span>Warning ({threshold.warning}{unit} - {threshold.critical}{unit})</span>
                </div>
                <div className="threshold-legend">
                    <span className="threshold-marker red"></span>
                    <span>Critical (above {threshold.critical}{unit})</span>
                </div>
            </div>
            <div className="gauge-labels">
                <span>{min}{unit}</span>
                <span>{max}{unit}</span>
            </div>
        </div>
    );
};

interface GaugeChartWithPredictionProps extends GaugeChartProps {
    /** Probability (0..1) that the value will become critical, e.g. from a future ML model. */
    prediction?: number;
}

const GaugeChartWithPrediction = ({ prediction, ...props }: GaugeChartWithPredictionProps) => {
    const [status, setStatus] = useState<Status>('normal');

    useEffect(() => {
        if (prediction === undefined) return;

        if (prediction > 0.9) setStatus('critical');
        else if (prediction > 0.5) setStatus('warning');
        else setStatus('normal');
    }, [prediction]);

    return (
        <div className="gauge-with-prediction">
            <GaugeChart {...props} />
            {prediction !== undefined && (
                <div className={`prediction-status ${status}`}>
                    {`Prediction: ${(prediction * 100).toFixed(1)}% (${status.toUpperCase()})`}
                </div>
            )}
        </div>
    );
};

export { GaugeChartWithPrediction };
export default GaugeChart;
