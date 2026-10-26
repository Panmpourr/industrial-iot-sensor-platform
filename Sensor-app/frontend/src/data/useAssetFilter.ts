import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { assetFilter } from '../assets';
import { useSensorData } from './SensorDataContext';

/**
 * The "area" filter of a page, kept in the URL (`?asset=<id>` or `?asset=unassigned`) so a
 * filtered view can be bookmarked or shared. `sensorMatches` tells whether a sensor is in it.
 */
export const useAssetFilter = () => {
    const { assets, sensors } = useSensorData();
    const [params, setParams] = useSearchParams();
    const filter = params.get('asset') ?? '';

    const setFilter = useCallback((value: string) => {
        setParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set('asset', value);
            else next.delete('asset');
            return next;
        }, { replace: true });
    }, [setParams]);

    const sensorMatches = useMemo(() => {
        const matches = assetFilter(assets, filter);
        // Alarms can outlive their sensor; those only show without a filter
        return (sensorId: string) => (sensors[sensorId] ? matches(sensors[sensorId].assetId) : !filter);
    }, [assets, sensors, filter]);

    return { filter, setFilter, sensorMatches };
};
