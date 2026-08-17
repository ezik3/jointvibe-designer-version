import VenueLayout from './VenueLayout';
import VenueMenuWorkspace from './VenueMenuWorkspace';

/**
 * The supplied menu reference uses the venue rail by default. Its POS rail is
 * shown only for `?context=pos`, which is routed separately to POSLayout.
 */
export default function VenueMenuDualShell() {
  return (
    <VenueLayout suppressWorkspaceChrome activeNavigationKey="menu">
      <VenueMenuWorkspace />
    </VenueLayout>
  );
}
