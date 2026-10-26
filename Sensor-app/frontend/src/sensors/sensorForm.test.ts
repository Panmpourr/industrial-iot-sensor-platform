import { describe, expect, it } from 'vitest';
import { connectionValid, defaultLimits, fromSensor, limitsValid, toDetails } from './sensorForm';
import type { Sensor } from '../types';

const opcua: Sensor = {
    name: 'Oven',
    type: 'Plc-Opcua',
    userId: 'u1',
    assetId: null,
    details: {
        endpointUrl: 'opc.tcp://plc:4840',
        nodeId: 'ns=2;i=2',
        latitude: 40.64,
        threshold: { unit: '°C', min: 0, max: 100, warning: 70, critical: 90 },
    },
};

describe('fromSensor / toDetails', () => {
    it('fills the form with the stored settings', () => {
        const { connection, limits } = fromSensor(opcua);

        expect(connection).toEqual({ endpointUrl: 'opc.tcp://plc:4840', nodeId: 'ns=2;i=2' });
        expect(limits).toEqual({
            unit: '°C', min: '0', max: '100', warning: '70', critical: '90',
            lowWarning: '', lowCritical: '', deadband: '', onDelay: '', latitude: '40.64', longitude: '',
        });
    });

    it('round-trips the settings unchanged', () => {
        const { connection, limits } = fromSensor(opcua);

        expect(toDetails(connection, limits)).toEqual({ ...opcua.details, longitude: undefined });
    });

    it('applies edited limits and trims connection values', () => {
        const { connection, limits } = fromSensor(opcua);

        const details = toDetails({ ...connection, nodeId: ' ns=2;i=3 ' }, { ...limits, warning: '60', latitude: '' });

        expect(details.nodeId).toBe('ns=2;i=3');
        expect(details.threshold?.warning).toBe(60);
        expect(details.latitude).toBeUndefined();
    });

    it('uses the type defaults when a sensor has no limits yet', () => {
        const { limits } = fromSensor({ ...opcua, details: { endpointUrl: 'x', nodeId: 'y' } });

        expect(limits).toEqual(defaultLimits('Plc-Opcua'));
    });
});

describe('validation', () => {
    it('requires every connection field', () => {
        expect(connectionValid('Plc-Opcua', { endpointUrl: 'opc.tcp://plc:4840', nodeId: ' ' })).toBe(false);
        expect(connectionValid('Plc-Opcua', { endpointUrl: 'opc.tcp://plc:4840', nodeId: 'ns=2;i=2' })).toBe(true);
    });

    it('rejects inconsistent limits', () => {
        const limits = defaultLimits('Plc-Opcua');

        expect(limitsValid(limits)).toBe(true);
        expect(limitsValid({ ...limits, warning: '95' })).toBe(false);   // warning above critical
        expect(limitsValid({ ...limits, min: '100' })).toBe(false);      // min not below max
        expect(limitsValid({ ...limits, latitude: 'north' })).toBe(false);
    });

    it('checks the optional low limits, deadband and on-delay', () => {
        const limits = defaultLimits('Plc-Opcua');

        expect(limitsValid({ ...limits, lowWarning: '10', lowCritical: '5' })).toBe(true);
        expect(limitsValid({ ...limits, lowWarning: '5', lowCritical: '10' })).toBe(false);  // low-low above low
        expect(limitsValid({ ...limits, lowWarning: '80' })).toBe(false);                   // low above warning
        expect(limitsValid({ ...limits, deadband: '-1' })).toBe(false);
        expect(limitsValid({ ...limits, onDelay: 'soon' })).toBe(false);
    });

    it('stores empty optional limits as missing', () => {
        const details = toDetails({}, { ...defaultLimits('Plc-Opcua'), lowWarning: ' ', onDelay: '3' });

        expect(details.threshold?.lowWarning).toBeUndefined();
        expect(details.threshold?.onDelay).toBe(3);
    });
});
