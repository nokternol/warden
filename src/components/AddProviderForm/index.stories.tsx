import type { ProviderTypeDescriptor } from '@contract/providers';
import type { Story } from '@ladle/react';
import AddProviderForm from './index';

/** The offered types as /api/providers/types serves them. */
const offeredTypes: ProviderTypeDescriptor[] = [
  { type: 'PLEX', label: 'Plex', apiPath: '', filterData: ['Library contents', 'Item metadata'] },
  {
    type: 'JELLYFIN',
    label: 'Jellyfin',
    apiPath: '',
    filterData: ['Library contents', 'Item metadata'],
  },
  {
    type: 'RADARR',
    label: 'Radarr',
    apiPath: '/api/v3',
    filterData: ['Movie library', 'Quality profiles', 'Tags'],
  },
  {
    type: 'SONARR',
    label: 'Sonarr',
    apiPath: '/api/v3',
    filterData: ['Series library', 'Quality profiles', 'Tags'],
  },
  {
    type: 'TAUTULLI',
    label: 'Tautulli',
    apiPath: '',
    filterData: ['Watch history', 'Play statistics', 'User activity'],
  },
  { type: 'OVERSEERR', label: 'Overseerr', apiPath: '', filterData: ['Request queue'] },
];

export const OfferedTypes: Story = () => (
  <div className="max-w-3xl p-6">
    <AddProviderForm types={offeredTypes} onSubmit={() => {}} onCancel={() => {}} />
  </div>
);

/** A hosted type the server gives a fixed URL: the host is filled in and locked. */
export const HostedTypeWithFixedUrl: Story = () => (
  <div className="max-w-3xl p-6">
    <AddProviderForm
      types={[
        {
          type: 'TMDB',
          label: 'TMDB',
          apiPath: '',
          defaultUrl: 'https://api.themoviedb.org/3',
          filterData: ['Ratings', 'Metadata'],
        },
      ]}
      onSubmit={() => {}}
      onCancel={() => {}}
    />
  </div>
);

/** While the served types load: the form says so and Save is disabled. */
export const LoadingTypes: Story = () => (
  <div className="max-w-3xl p-6">
    <AddProviderForm types={undefined} onSubmit={() => {}} onCancel={() => {}} />
  </div>
);

/** No type is offered: the form says so and Save is disabled. */
export const NoTypesOffered: Story = () => (
  <div className="max-w-3xl p-6">
    <AddProviderForm types={[]} onSubmit={() => {}} onCancel={() => {}} />
  </div>
);
