// Kandungan diambil bulat-bulat daripada SOP Troubleshooting Laser Machine —
// Master (Version 3, 19.3.2025).
//
// Teks, ambang ampere dan urutan keputusan TIDAK diubah. Fail ini hanya
// menyusun semula carta alir 2D itu menjadi struktur menegak supaya boleh
// dibaca di telefon. Sebarang pindaan kandungan mesti datang daripada SOP
// yang dikemas kini, bukan diedit di sini.

/**
 * Nada visual mengikut warna kotak dalam carta asal:
 * - `start`  kotak kuning pembuka
 * - `action` kotak bertanda kuning — tindakan ganti
 * - `exit`   kotak oren — keluar ke SOP lain
 * - `plain`  kotak putih biasa
 */
export type NodeTone = 'start' | 'action' | 'exit' | 'plain'

export interface TroubleshootNode {
  label: string
  tone?: NodeTone
  /** Baris kecil di bawah label, seperti nota dalam kurungan pada carta. */
  note?: string
  children?: TroubleshootNode[]
}

export interface TroubleshootBranch {
  id: string
  /** Teks kotak simptom dalam carta. */
  label: string
  note?: string
  tone: NodeTone
  nodes: TroubleshootNode[]
}

export const SOP_META = {
  title: 'SOP Troubleshooting Laser Machine- Master',
  version: 'Version 3',
  date: '19.3.2025',
  purpose: 'Troubleshoot Laser Machine not Working',
  scope: 'Production Team Engineer',
  responsibilities: 'Production Team',
  start: 'Problem Machine Laser',
}

/** Enam semakan wajib sebelum masuk mana-mana cabang. */
export const FULL_TEST = {
  title: 'Run Full Test (Check)',
  items: [
    'Emergency Stop Button',
    '3 Mirror & Lens',
    'Water Chiller (on/off)',
    'Run 4 Corner Test',
    'Test Tembak Laser di Head',
    'Baca Ampere',
  ],
}

export const BRANCHES: TroubleshootBranch[] = [
  {
    id: 'corner',
    label: '4 Corner Test',
    tone: 'plain',
    nodes: [
      {
        label: 'Ada yang tembus, Ada yang tak tembus',
        children: [{ label: 'SOP Laser Alignment', tone: 'exit' }],
      },
      {
        label: 'Semua 4 Corner jadi Marking/ No Laser',
        note: '(Tak tembus)',
        children: [
          {
            label: 'Check Ampere',
            children: [
              {
                label: '<4 Amp( Problem)',
                children: [{ label: 'Replace Power Supply', tone: 'action' }],
              },
              {
                label: '>15 Amp(Okay)',
                note: 'Tube more 15 months >>',
                children: [
                  {
                    label: 'Replace Tube',
                    tone: 'action',
                    children: [{ label: 'SOP Laser Alignment', tone: 'exit' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'no-laser',
    label: 'No Laser at All',
    tone: 'plain',
    nodes: [
      {
        label: 'Test Power Button di Power Supply',
        children: [
          {
            label: 'Yes Laser',
            children: [
              {
                label: 'SOP Maintenance Laser- Mesin Senyap/Board Tak hidup',
                tone: 'exit',
              },
            ],
          },
          {
            label: 'No Laser',
            children: [
              {
                label: 'Check Amp Current',
                children: [
                  {
                    label: 'No Amp / <5 Amp',
                    children: [
                      { label: 'Replace Power Supply', tone: 'action' },
                    ],
                  },
                  {
                    label: 'Yes? Check Water Protect Sensor, (Short/Clog)',
                    tone: 'exit',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'initiation',
    label: 'Initiation Crash',
    note: ':Axis Sensor Issue',
    tone: 'exit',
    nodes: [
      {
        label: 'Cek Kedudukan Sensor',
        children: [
          {
            label: 'Tukar Sensor jika tidak ada sebarang Response',
            note: '(kemungkinan ada wayar putus)',
          },
        ],
      },
    ],
  },
  {
    id: 'motor',
    label: 'Motor Tak Jalan',
    tone: 'exit',
    nodes: [
      {
        label: 'Refer SOP Maintenance Laser - Motor tak Jalan',
        tone: 'exit',
      },
    ],
  },
]

export const RARE_EVENTS = {
  title: 'Rare Events',
  items: [
    'Sensor faulty - menyebabkan short/trip mesin',
    'Faulty Ammeter Power Supply Laser - menyebabkan Laser Tube Tembak 0.1 Ampere',
  ],
}
