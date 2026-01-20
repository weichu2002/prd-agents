
import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ImpactData } from '../types';

interface Props {
    data: ImpactData;
    onDeleteNode?: (id: string) => void;
}

const ImpactGraph: React.FC<Props> = ({ data, onDeleteNode }) => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!svgRef.current || !data.nodes || data.nodes.length === 0) return;

        const width = svgRef.current.clientWidth || 600;
        const height = 400;

        const svg = d3.select(svgRef.current);
        svg.selectAll("*").remove(); // Clear previous

        // Create arrows definition
        svg.append("defs").selectAll("marker")
            .data(["end"])
            .join("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 15)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#999");

        const simulation = d3.forceSimulation(JSON.parse(JSON.stringify(data.nodes))) 
            .force("link", d3.forceLink(JSON.parse(JSON.stringify(data.links))).id((d: any) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6)
            .selectAll("line")
            .data(JSON.parse(JSON.stringify(data.links)))
            .join("line")
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrow)");

        const node = svg.append("g")
            .attr("stroke", "#fff")
            .attr("stroke-width", 1.5)
            .selectAll("circle")
            .data(JSON.parse(JSON.stringify(data.nodes)))
            .join("circle")
            .attr("r", (d: any) => (d.val || 10))
            .attr("fill", (d: any) => {
                if(d.group === 1) return "#FF6A00"; // Feature
                if(d.group === 2) return "#3b82f6"; // Service
                return "#10b981"; // Database/Infra
            })
            .style("cursor", "pointer")
            .on("dblclick", (event, d: any) => {
                if (onDeleteNode && confirm(`Confirm delete node: ${d.id}?`)) {
                    onDeleteNode(d.id);
                }
            })
            .call(drag(simulation) as any);

        node.append("title").text((d: any) => `${d.id} (Double click to delete)`);

        const labels = svg.append("g")
            .selectAll("text")
            .data(JSON.parse(JSON.stringify(data.nodes)))
            .join("text")
            .attr("dx", 12)
            .attr("dy", ".35em")
            .text((d: any) => d.id)
            .style("font-size", "11px")
            .style("font-family", "sans-serif")
            .style("fill", "#333")
            .style("font-weight", "bold");

        simulation.on("tick", () => {
            link
                .attr("x1", (d: any) => d.source.x)
                .attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x)
                .attr("y2", (d: any) => d.target.y);

            node
                .attr("cx", (d: any) => d.x)
                .attr("cy", (d: any) => d.y);

            labels
                .attr("x", (d: any) => d.x)
                .attr("y", (d: any) => d.y);
        });

        function drag(simulation: any) {
            function dragstarted(event: any) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }

            function dragged(event: any) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }

            function dragended(event: any) {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }

            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
    }, [data, onDeleteNode]);

    if (!data.nodes || data.nodes.length === 0) {
        return (
            <div className="w-full h-[400px] bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400">
                暂无分析数据，请点击上方“AI 构建”或手动添加节点
            </div>
        );
    }

    return <svg ref={svgRef} className="w-full h-[400px] bg-white rounded-lg border border-gray-200 shadow-inner" />;
};

export default ImpactGraph;
