export interface VenueOperatingHour {
  day: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export const venueOperatingDays = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
] as const;

export const createDefaultVenueOperatingHours = (): VenueOperatingHour[] => (
  venueOperatingDays.map((day) => ({
    day: day.value,
    openTime: "09:00",
    closeTime: "22:00",
    isClosed: false,
  }))
);

export function normalizeVenueOperatingHours(
  hours: Partial<VenueOperatingHour>[] | null | undefined,
): VenueOperatingHour[] {
  const byDay = new Map(hours?.map((hour) => [hour.day, hour]) ?? []);

  return venueOperatingDays.map((day) => {
    const hour = byDay.get(day.value);
    return {
      day: day.value,
      openTime: hour?.openTime?.slice(0, 5) || "09:00",
      closeTime: hour?.closeTime?.slice(0, 5) || "22:00",
      isClosed: hour?.isClosed ?? false,
    };
  });
}
