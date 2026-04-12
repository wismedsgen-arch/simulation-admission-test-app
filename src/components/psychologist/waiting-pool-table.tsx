"use client";

import { useMemo, useState } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { UiSelect } from "@/components/shared/ui-select";
import { claimStudentAction } from "@/lib/actions/psychologist";

type WaitingStudent = {
  id: string;
  fullName: string;
  governmentId: string;
  examName: string;
};

export function WaitingPoolTable({ students }: { students: WaitingStudent[] }) {
  const [query, setQuery] = useState("");
  const [selectedExam, setSelectedExam] = useState("ALL");

  const examOptions = useMemo(
    () => [
      { value: "ALL", label: "All exams" },
      ...Array.from(new Set(students.map((student) => student.examName)))
        .sort((left, right) => left.localeCompare(right))
        .map((examName) => ({ value: examName, label: examName }))
    ],
    [students]
  );

  const filteredStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return students.filter((student) => {
      const matchesExam = selectedExam === "ALL" || student.examName === selectedExam;
      const matchesQuery =
        !normalized ||
        student.fullName.toLowerCase().includes(normalized) ||
        student.governmentId.toLowerCase().includes(normalized) ||
        student.examName.toLowerCase().includes(normalized);

      return matchesExam && matchesQuery;
    });
  }, [query, selectedExam, students]);

  return (
    <div className="stack-md">
      <div className="field-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 280px" }}>
        <div className="field">
          <label htmlFor="waiting-pool-search">Search waiting pool</label>
          <input
            id="waiting-pool-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by full name or government ID"
          />
        </div>
        <div className="field">
          <label htmlFor="waiting-pool-exam">Exam</label>
          <UiSelect
            id="waiting-pool-exam"
            value={selectedExam}
            onChange={setSelectedExam}
            options={examOptions}
          />
        </div>
      </div>

      <div className="panel table-shell">
        <table className="table">
          <thead>
            <tr>
              <th>Student</th>
              <th>ID</th>
              <th>Exam</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.map((student) => (
              <tr key={student.id}>
                <td>{student.fullName}</td>
                <td className="mono">{student.governmentId}</td>
                <td>{student.examName}</td>
                <td style={{ textAlign: "right" }}>
                  <ActionForm action={claimStudentAction} className="" hideMessages>
                    <input type="hidden" name="cycleStudentId" value={student.id} />
                    <button type="submit" className="btn btn-primary">
                      Claim
                    </button>
                  </ActionForm>
                </td>
              </tr>
            ))}
            {filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No students matched that search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
