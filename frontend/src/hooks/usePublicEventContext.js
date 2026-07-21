import { useEffect, useMemo, useState } from 'react';
import { getPublicCurrentEvent, getPublicEvent, getPublicEventById } from '../utils/api';
import { eventContextFromSearch, eventContextToParams } from '../utils/eventContext';

function eventIdentityError(event, requested) {
  if (requested.eventSlug && requested.eventSlug !== event?.slug) {
    return 'ข้อมูลกิจกรรมในลิงก์ไม่สอดคล้องกัน';
  }
  if (requested.eventYear && String(requested.eventYear) !== String(event?.eventYear)) {
    return 'ปีของกิจกรรมในลิงก์ไม่ตรงกับกิจกรรมที่เลือก';
  }
  return '';
}

export default function usePublicEventContext(search = window.location.search) {
  const requested = useMemo(() => eventContextFromSearch(search), [search]);
  const [state, setState] = useState({ event: null, loading: true, error: '' });

  useEffect(() => {
    let active = true;
    setState({ event: null, loading: true, error: '' });

    const request = requested.eventSlug
      ? getPublicEvent(requested.eventSlug)
      : requested.eventId
        ? getPublicEventById(requested.eventId)
        : getPublicCurrentEvent();

    request
      .then((response) => {
        if (!active) return;
        const event = response?.data?.data;
        const identityError = eventIdentityError(event, requested);
        if (!event || identityError) {
          setState({ event: null, loading: false, error: identityError || 'ไม่พบข้อมูลกิจกรรม' });
          return;
        }
        setState({ event, loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        const message = error?.response?.data?.message || 'ไม่สามารถโหลดข้อมูลกิจกรรมได้';
        setState({ event: null, loading: false, error: message });
      });

    return () => {
      active = false;
    };
  }, [requested]);

  const eventParams = useMemo(() => {
    if (!state.event) return {};
    return eventContextToParams({
      eventSlug: state.event.slug,
      eventYear: state.event.eventYear,
    });
  }, [state.event]);

  return { ...state, eventParams };
}
