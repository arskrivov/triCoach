/**
 * Unit tests for DisciplineFilter component.
 *
 * @see Requirements 6.3
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";

import { DisciplineFilter } from "../../../components/activities/DisciplineFilter";
import type { Discipline } from "../../../lib/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({
  __esModule: true,
  default: jest.fn(() => "light"),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DisciplineFilter", () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  describe("All chip", () => {
    it("renders an All chip", () => {
      const { getByText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      expect(getByText("All")).toBeTruthy();
    });

    it("calls onSelect with null when All chip is pressed", () => {
      const { getByText } = render(
        <DisciplineFilter selected="RUN" onSelect={mockOnSelect} />
      );
      fireEvent.press(getByText("All"));
      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
  });

  describe("discipline chips", () => {
    it("renders chips for all 7 disciplines", () => {
      const { getByText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      // Each chip shows emoji + label from getDisciplineMeta
      expect(getByText(/Swim/)).toBeTruthy();
      expect(getByText(/Run/)).toBeTruthy();
      expect(getByText(/Road Ride/)).toBeTruthy();
      expect(getByText(/Gravel/)).toBeTruthy();
      expect(getByText(/Strength/)).toBeTruthy();
      expect(getByText(/Yoga/)).toBeTruthy();
      expect(getByText(/Mobility/)).toBeTruthy();
    });

    it("calls onSelect with the discipline when a chip is pressed", () => {
      const { getByText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      fireEvent.press(getByText(/Run/));
      expect(mockOnSelect).toHaveBeenCalledWith("RUN");
    });

    it("calls onSelect with SWIM when Swim chip is pressed", () => {
      const { getByText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      fireEvent.press(getByText(/Swim/));
      expect(mockOnSelect).toHaveBeenCalledWith("SWIM");
    });
  });

  describe("emoji display", () => {
    it("shows discipline emoji alongside label", () => {
      const { getByText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      // getDisciplineMeta returns emoji + label, e.g. "🏃 Run"
      const runChip = getByText(/🏃/);
      expect(runChip).toBeTruthy();
      const swimChip = getByText(/🏊/);
      expect(swimChip).toBeTruthy();
    });
  });

  describe("selection state", () => {
    it("highlights the selected discipline chip", () => {
      const { getByLabelText } = render(
        <DisciplineFilter selected="RUN" onSelect={mockOnSelect} />
      );
      const runChip = getByLabelText("Filter by Run");
      expect(runChip.props.accessibilityState).toEqual({ selected: true });
    });

    it("marks All chip as selected when selected is null", () => {
      const { getByLabelText } = render(
        <DisciplineFilter selected={null} onSelect={mockOnSelect} />
      );
      const allChip = getByLabelText("All disciplines");
      expect(allChip.props.accessibilityState).toEqual({ selected: true });
    });

    it("marks All chip as not selected when a discipline is selected", () => {
      const { getByLabelText } = render(
        <DisciplineFilter selected="SWIM" onSelect={mockOnSelect} />
      );
      const allChip = getByLabelText("All disciplines");
      expect(allChip.props.accessibilityState).toEqual({ selected: false });
    });
  });
});
