import { AthleteProfileCard } from "./athlete-profile-card";
import { GarminConnectCard } from "./garmin-connect-card";

export default function AccountPage() {
  return (
    <div className="px-4 py-6 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-xl sm:text-2xl font-semibold text-foreground mb-6">Account</h1>
      <div className="flex flex-col gap-6">
        <AthleteProfileCard />
        <GarminConnectCard />
      </div>
    </div>
  );
}
