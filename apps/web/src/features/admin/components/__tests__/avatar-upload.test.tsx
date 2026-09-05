import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { AvatarUpload } from '../avatar-upload'

/**
 * The live region used to read `upload.isSuccess` and `remove.isSuccess` side by
 * side. Both stay true once they have succeeded, so after removing a photo and
 * uploading another the region still announced "Profile photo removed." while a
 * photo was plainly set. These hold the line that it describes the LAST
 * operation and nothing else.
 */

const PRESIGN = '/api/v1/me/avatar/presign'
const CONFIRM = '/api/v1/me/avatar'
const STORAGE = 'http://storage.test/put'

function png(name = 'me.png') {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], name, { type: 'image/png' })
}

/** The live region is the only `sr-only` paragraph with aria-live. */
function announcement(): string {
  return document.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
}

function happyPath() {
  server.use(
    http.post(PRESIGN, () =>
      HttpResponse.json(ok({ uploadUrl: STORAGE, method: 'PUT', headers: {} })),
    ),
    http.put(STORAGE, () => new HttpResponse(null, { status: 200 })),
    http.put(CONFIRM, () => HttpResponse.json(ok({ avatarUrl: '/api/v1/users/u1/avatar?v=abc' }))),
    http.get('/api/v1/me', () => HttpResponse.json(ok({ avatarUrl: null, name: 'A' }))),
  )
}

beforeEach(() => {
  happyPath()
  // jsdom implements neither, and the component makes an object URL for the
  // preview. Stubbed rather than avoided: revoking it is part of what the
  // component does, and a test that skipped the preview would not exercise it.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  })
})

describe('the live region describes the latest operation', () => {
  it('announces an upload', async () => {
    renderWithProviders(<AvatarUpload avatarUrl={null} name="Ada Lovelace" />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/choose a profile photo/i), png())

    await waitFor(() => expect(announcement()).toBe('Profile photo updated.'))
  })

  it('announces a removal', async () => {
    server.use(http.delete(CONFIRM, () => HttpResponse.json(ok({ avatarUrl: null }))))
    renderWithProviders(<AvatarUpload avatarUrl="/api/v1/users/u1/avatar?v=abc" name="Ada" />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(announcement()).toBe('Profile photo removed.'))
  })

  it('does not keep announcing a removal after a later upload', async () => {
    // The exact sequence the defect was found in.
    server.use(http.delete(CONFIRM, () => HttpResponse.json(ok({ avatarUrl: null }))))
    const { rerender } = renderWithProviders(
      <AvatarUpload avatarUrl="/api/v1/users/u1/avatar?v=abc" name="Ada" />,
    )
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /remove/i }))
    await waitFor(() => expect(announcement()).toBe('Profile photo removed.'))

    rerender(<AvatarUpload avatarUrl={null} name="Ada" />)
    await user.upload(screen.getByLabelText(/choose a profile photo/i), png('next.png'))

    await waitFor(() => expect(announcement()).toBe('Profile photo updated.'))
    expect(announcement()).not.toMatch(/removed/i)
  })

  it('announces a failure rather than a success', async () => {
    server.use(http.put(STORAGE, () => new HttpResponse(null, { status: 503 })))
    renderWithProviders(<AvatarUpload avatarUrl={null} name="Ada" />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/choose a profile photo/i), png())

    await waitFor(() => expect(announcement()).toMatch(/could not be uploaded/i))
    expect(announcement()).not.toMatch(/updated/i)
  })

  it('says nothing before anything has happened', () => {
    renderWithProviders(<AvatarUpload avatarUrl={null} name="Ada" />)
    expect(announcement()).toBe('')
  })

  it('announces a rejected confirmation, not a success', async () => {
    server.use(
      http.put(CONFIRM, () =>
        HttpResponse.json(
          fail([{ code: 'VALIDATION_ERROR', message: 'That image is too large.' }]),
          {
            status: 422,
          },
        ),
      ),
    )
    renderWithProviders(<AvatarUpload avatarUrl={null} name="Ada" />)
    const user = userEvent.setup()

    await user.upload(screen.getByLabelText(/choose a profile photo/i), png())

    await waitFor(() => expect(announcement()).not.toBe(''))
    expect(announcement()).not.toMatch(/updated/i)
  })
})

describe('the controls follow whether a photo exists', () => {
  it('offers Change and Remove once there is one', () => {
    renderWithProviders(<AvatarUpload avatarUrl="/api/v1/users/u1/avatar?v=abc" name="Ada" />)
    expect(screen.getByRole('button', { name: /change photo/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('offers Upload rather than Change when there is no photo', () => {
    renderWithProviders(<AvatarUpload avatarUrl={null} name="Ada" />)
    expect(screen.getByRole('button', { name: /upload photo/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })
})
