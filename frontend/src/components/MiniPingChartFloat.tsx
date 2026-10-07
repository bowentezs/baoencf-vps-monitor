import React, { useCallback, useState } from 'react';
import { Popover } from '@radix-ui/themes';
import { Popover as PopoverPrimitive } from 'radix-ui';
import MiniPingChart from './MiniPingChart';

interface MiniPingChartFloatProps {
  uuid: string;
  trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  chartWidth?: string | number;
  chartHeight?: number;
  limit?: number;
  rangeHours?: number;
  includeHidden?: boolean;
}

export default function MiniPingChartFloat({
  uuid,
  trigger,
  chartWidth = 440,
  chartHeight = 260,
  limit = 360,
  rangeHours = 1,
  includeHidden = false,
}: MiniPingChartFloatProps) {
  const [open, setOpen] = useState(false);

  const handleTriggerClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    trigger.props.onClick?.(event);
  }, [trigger]);

  const handleTriggerPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    trigger.props.onPointerDown?.(event);
    event.stopPropagation();
  }, [trigger]);

  const triggerElement = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    onPointerDown: handleTriggerPointerDown,
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        {triggerElement}
      </PopoverPrimitive.Trigger>
      <Popover.Content
        align="end"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="mini-ping-popover-content"
        style={{
          padding: 0,
          border: 'none',
          background: 'transparent',
          boxShadow: 'none',
          borderRadius: 14,
          zIndex: 5,
          width: chartWidth,
          maxWidth: 'calc(100vw - 24px)',
        }}
      >
        <MiniPingChart uuid={uuid} width="100%" height={chartHeight} limit={limit} rangeHours={rangeHours} includeHidden={includeHidden} />
      </Popover.Content>
    </Popover.Root>
  );
}
