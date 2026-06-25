import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';

export interface Contact {
  id: string;
  ownerId: string;
  contactUserId: string;
  nickname: string | null;
  savedAt: string;
  contactEmail: string;
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContacts = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch('/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const acceptRequest = async (requestId: string) => {
    await apiFetch('/contacts/accept', {
      method: 'POST',
      body: JSON.stringify({ requestId }),
    });
    // refresh contacts list
    await fetchContacts();
  };

  const rejectRequest = async (requestId: string) => {
    await apiFetch(`/contacts/reject/${requestId}`, {
      method: 'POST',
    });
  };

  const updateNickname = async (contactId: string, nickname: string) => {
    await apiFetch(`/contacts/${contactId}/nickname`, {
      method: 'PATCH',
      body: JSON.stringify({ nickname }),
    });
    await fetchContacts();
  };

  const deleteContact = async (contactId: string) => {
    await apiFetch(`/contacts/${contactId}`, {
      method: 'DELETE',
    });
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
  };

  return {
    contacts,
    isLoading,
    fetchContacts,
    acceptRequest,
    rejectRequest,
    updateNickname,
    deleteContact,
  };
}
