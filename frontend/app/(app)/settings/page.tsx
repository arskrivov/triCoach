import { GarminConnectCard } from "./garmin-connect-card";
import { AthleteProfileCard } from "./athlete-profile-card";

export default function SettingsPage() {
  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Settings</h1>
      <div className="flex flex-col gap-6">
        <AthleteProfileCard />
        <GarminConnectCard />
      </div>
    </div>
  );
}
